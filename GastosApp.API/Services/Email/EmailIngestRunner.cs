using GastosApp.API.Configuration;
using GastosApp.BusinessLogic.Interfaces;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Email;

/// <summary>Motivos por los que el pase diario no lee el buzón. Son códigos estables para el log.</summary>
public static class EmailIngestSkipCode
{
    public const string OwnerMissing = "owner_missing";
    public const string NotConfigured = "imap_not_configured";
    public const string MailboxUnreachable = "mailbox_unreachable";
}

/// <summary>
/// Resultado de una corrida. Solo conteos y un código: nunca asuntos, remitentes, etiquetas ni
/// credenciales.
/// </summary>
public sealed record EmailIngestRunResult(
    bool Executed,
    string? SkipCode,
    int Scanned,
    int Planned,
    int Applied,
    int Skipped,
    int Failed)
{
    public static EmailIngestRunResult Skip(string code) => new(false, code, 0, 0, 0, 0, 0);
}

/// <summary>
/// Corre una sola pasada diaria para un dueño explícito. Existe como interfaz para que el servicio en
/// segundo plano se pruebe sin resolver la base ni el buzón.
/// </summary>
public interface IEmailIngestRunner
{
    Task<EmailIngestRunResult> RunAsync(int userId, CancellationToken cancellationToken);
}

/// <summary>
/// Pase diario de etiquetado (S13/L28). Reutiliza el clasificador y el catálogo de etiquetas del
/// usuario, arma un plan en memoria y lo aplica directamente con <see cref="IImapLabelApplier"/>:
/// no usa el token del módulo de prueba, no crea borradores ni transacciones y no escribe en la base.
/// <para>
/// Solo INBOX, y solo correo sin NINGUNA etiqueta de usuario. Un correo sin regla, demasiado viejo o
/// cuya etiqueta de catálogo no existe en el buzón queda intacto: no se inventa etiqueta ni carpeta.
/// </para>
/// <para>
/// El plan lleva <see cref="EmailApplyPlan.RequireUnlabelled"/> encendido: el escritor vuelve a mirar
/// la instantánea de etiquetas justo antes de cada STORE y omite la fila si apareció una etiqueta de
/// usuario. Eso reduce la carrera; no la vuelve atómica, porque son dos operaciones del servidor.
/// </para>
/// <para>
/// Desde S15 una regla con acción <c>llm</c> puede producir la etiqueta: la elige el modelo entre las
/// etiquetas activas del usuario y la pasada la aplica como cualquier otra (nunca borra ni mueve
/// correo, ni siquiera si el modelo eligió una etiqueta de descarte). El tope
/// <c>Email:LlmMaxPerRun</c> es de la pasada completa y las fallas terminan en revisión, que no escribe
/// nada. El respaldo automático de <c>no_match</c> sigue apagado por defecto.
/// </para>
/// </summary>
public sealed class EmailIngestRunner : IEmailIngestRunner
{
    private readonly IImapDailyMailboxSource _source;
    private readonly IEmailClassificationService _classification;
    private readonly IEmailLabelService _labels;
    private readonly IImapLabelApplier _applier;
    private readonly EmailIngestCursor _cursor;
    private readonly EmailIngestOptions _options;
    private readonly ILogger<EmailIngestRunner> _logger;
    private readonly EmailLlmClassificationService? _llm;

    /// <param name="llm">
    /// Orquestador del respaldo LLM (S15). Es opcional solo por compatibilidad con los llamadores
    /// anteriores y sus pruebas; el contenedor de dependencias siempre lo inyecta. Sin él la pasada
    /// conserva exactamente el comportamiento determinista.
    /// </param>
    public EmailIngestRunner(
        IImapDailyMailboxSource source,
        IEmailClassificationService classification,
        IEmailLabelService labels,
        IImapLabelApplier applier,
        EmailIngestCursor cursor,
        IOptions<EmailIngestOptions> options,
        ILogger<EmailIngestRunner> logger,
        EmailLlmClassificationService? llm = null)
    {
        _source = source;
        _classification = classification;
        _labels = labels;
        _applier = applier;
        _cursor = cursor;
        _options = options.Value;
        _logger = logger;
        _llm = llm;
    }

    public async Task<EmailIngestRunResult> RunAsync(int userId, CancellationToken cancellationToken)
    {
        // El dueño es obligatorio y explícito: no se cae al usuario 1 ni a una identidad de Telegram.
        if (userId <= 0)
        {
            return EmailIngestRunResult.Skip(EmailIngestSkipCode.OwnerMissing);
        }

        if (!_source.IsConfigured)
        {
            return EmailIngestRunResult.Skip(EmailIngestSkipCode.NotConfigured);
        }

        var maxMessages = Math.Clamp(_options.MaxMessages, 1, EmailIngestWindow.MaxScannedPerRun);
        var cursor = _cursor.Current;

        ImapDailyFetchResult fetched;
        try
        {
            fetched = await _source.FetchUnlabelledAsync(
                new ImapDailyFetchRequest(
                    cursor.AccountFingerprint,
                    cursor.UidValidity,
                    cursor.LastScannedUid,
                    maxMessages),
                cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (EmailApplyRefusedException refused)
        {
            // Buzón no configurado o sin etiquetas de Gmail: se falla cerrado, sin pase alternativo.
            return EmailIngestRunResult.Skip(refused.Code);
        }
        catch (Exception exception)
        {
            // Solo el tipo: nunca asuntos, remitentes ni credenciales.
            _logger.LogWarning(
                "Email daily pass could not read the mailbox: {ErrorType}",
                exception.GetType().Name);
            return EmailIngestRunResult.Skip(EmailIngestSkipCode.MailboxUnreachable);
        }

        var userLabelNames = EmailIngestLabelPolicy.UserLabelNames(fetched.UserLabelFolders);

        // El catálogo solo se lee cuando hay algo que clasificar: un INBOX ya etiquetado no debe
        // costar una consulta a la base.
        var catalog = new Dictionary<int, string>();
        if (fetched.Messages.Count > 0)
        {
            foreach (var label in await _labels.GetByUserIdAsync(userId, onlyActive: true))
            {
                if (label.LabelId > 0 && !string.IsNullOrWhiteSpace(label.Name))
                {
                    catalog[label.LabelId] = label.Name.Trim();
                }
            }
        }

        var items = new List<EmailApplyPlanItem>();
        var scanned = 0;

        // UN presupuesto para toda la pasada, construido antes del recorrido. Se declara siempre —aunque
        // no haya orquestador cableado— para que el invariante «una corrida, un presupuesto» no dependa
        // de la configuración: sin orquestador el tope es 0 porque no hay llamadas posibles.
        var llmBudget = _llm?.CreateRunBudget() ?? new EmailClassificationRunBudget(0);

        foreach (var message in fetched.Messages)
        {
            cancellationToken.ThrowIfCancellationRequested();
            scanned++;

            // Cualquier etiqueta de usuario excluye el mensaje, no solo la etiqueta destino de la
            // regla. Una etiqueta que no se pudo reconocer también lo excluye.
            if (EmailIngestLabelPolicy.Evaluate(message.Labels, userLabelNames) != EmailLabelSnapshotVerdict.NoUserLabel)
            {
                continue;
            }

            // Determinista primero; el orquestador solo llama al modelo si la regla lo pidió (o si el
            // respaldo de no_match está explícitamente encendido).
            var result = await EmailLlmClassificationService.DispatchAsync(
                _llm,
                _classification,
                userId,
                message.Candidate,
                llmBudget,
                cancellationToken);

            // Sin regla o demasiado viejo no nombran etiqueta: el correo queda intacto.
            if (!ImapApplyPolicy.IsEligible(result) || result.LabelId is not int labelId)
            {
                continue;
            }

            // La etiqueta debe existir en el catálogo activo y como carpeta de usuario en el buzón.
            if (!catalog.TryGetValue(labelId, out var labelName))
            {
                continue;
            }

            if (ImapApplyPolicy.FindTarget(fetched.UserLabelFolders, labelName) is null)
            {
                continue;
            }

            items.Add(new EmailApplyPlanItem(
                $"{fetched.Mailbox}#{message.Uid}",
                message.Uid,
                message.UidValidity,
                message.MessageId,
                labelName));
        }

        // El cursor avanza con el último UID examinado aunque ninguna fila haya tenido veredicto:
        // de lo contrario un tramo sin coincidencias se repite todos los días.
        if (fetched.LastScannedUid is uint lastScannedUid)
        {
            _cursor.Advance(fetched.AccountFingerprint, fetched.UidValidity, lastScannedUid);
        }

        if (items.Count == 0)
        {
            return new EmailIngestRunResult(true, null, scanned, 0, 0, 0, 0);
        }

        var plan = new EmailApplyPlan(
            userId,
            fetched.AccountFingerprint,
            fetched.Mailbox,
            fetched.UidValidity,
            items,
            RequireUnlabelled: true);

        try
        {
            var applied = await _applier.ApplyAsync(plan, cancellationToken);

            return new EmailIngestRunResult(
                true,
                null,
                scanned,
                items.Count,
                applied.Applied,
                applied.Skipped,
                applied.Failed);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (EmailApplyRefusedException refused)
        {
            // UIDVALIDITY o cuenta cambiaron entre la lectura y la escritura: no se escribe nada.
            _logger.LogWarning("Email daily apply refused: {RefusalCode}", refused.Code);
            return new EmailIngestRunResult(true, refused.Code, scanned, items.Count, 0, 0, 0);
        }
    }
}
