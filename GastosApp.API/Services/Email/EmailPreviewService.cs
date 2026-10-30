using GastosApp.API.Models.EmailClassification;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Email;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Email;

/// <summary>
/// Módulo de prueba del clasificador. Es un dry run estricto: clasifica y devuelve veredictos, pero no
/// inserta nada en <c>email_messages</c> ni crea borradores. Si escribiera, cada ajuste de reglas
/// quemaría los <c>Message-ID</c> ya reclamados y el libro de mensajes reportaría como procesado
/// correo que nunca lo fue.
/// <para>
/// Cuando la muestra sale del buzón real, la vista previa <b>no escribe en el correo</b>: se limita a
/// capturar la identidad de cada fila aplicable (UID, UIDVALIDITY, <c>Message-ID</c>) y a guardar el
/// plan en memoria con un token de un solo uso. Aplicar ese token (S12) repite exactamente lo revisado,
/// sin buscar correo de nuevo.
/// </para>
/// <para>
/// Tampoco escribe en la base ni aplica etiquetas. Sí puede <b>llamar al LLM</b>: si una regla con
/// acción <c>llm</c> casa, el veredicto lo pide el modelo y esa llamada se factura. El respaldo
/// automático de <c>no_match</c> solo ocurre si <c>Email:LlmFallbackEnabled</c> está encendido, y el
/// tope <c>Email:LlmMaxPerRun</c> se comparte entre todos los mensajes de la muestra.
/// </para>
/// </summary>
public sealed class EmailPreviewService
{
    private const int DefaultMaxItems = 50;
    private const int HardMaxItems = 200;

    private readonly IEmailClassificationService _classification;
    private readonly IImapMailboxSource _imap;
    private readonly IEmailLabelService _labels;
    private readonly EmailApplyPlanStore _planStore;
    private readonly EmailClassifierOptions _options;
    private readonly EmailLlmClassificationService? _llm;

    /// <param name="llm">
    /// Orquestador del respaldo LLM (S15). Es opcional solo para que los llamadores anteriores —y sus
    /// pruebas— sigan compilando; el contenedor de dependencias siempre lo inyecta, y sin él la muestra
    /// conserva exactamente el comportamiento determinista de antes.
    /// </param>
    public EmailPreviewService(
        IEmailClassificationService classification,
        IImapMailboxSource imap,
        IEmailLabelService labels,
        EmailApplyPlanStore planStore,
        IOptions<EmailClassifierOptions> options,
        EmailLlmClassificationService? llm = null)
    {
        _classification = classification;
        _imap = imap;
        _labels = labels;
        _planStore = planStore;
        _options = options.Value;
        _llm = llm;
    }

    public async Task<EmailPreviewResponse> PreviewAsync(
        int userId,
        EmailPreviewRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var response = new EmailPreviewResponse { DropOlderThanDays = _options.DropOlderThanDays };
        var maxItems = Math.Clamp(request.MaxItems ?? DefaultMaxItems, 1, HardMaxItems);
        var candidates = BuildCandidates(request, response);

        var remote = new List<ImapPreviewMessage>();
        var remoteMailbox = string.Empty;
        var remoteFingerprint = string.Empty;
        uint remoteUidValidity = 0;

        if (!string.IsNullOrWhiteSpace(request.Mailbox))
        {
            // La muestra pedida es el buzón, así que sus mensajes van primero. La lectura es de solo
            // lectura por contrato (ver ImapMailboxSource): el dry run no escribe ni en la base ni en
            // el correo del usuario.
            var remoteResult = await _imap.FetchAsync(
                new ImapFetchRequest(request.Mailbox, maxItems, request.From, request.To),
                cancellationToken);

            remoteMailbox = remoteResult.Mailbox;
            remoteFingerprint = remoteResult.AccountFingerprint;
            remoteUidValidity = remoteResult.UidValidity;
            remote.AddRange(remoteResult.Messages);

            candidates.InsertRange(
                0,
                remote.Select((message, index) => ($"{remoteMailbox}#{index + 1}", message.Candidate)));
        }

        var remoteCount = remote.Count;
        response.Total = candidates.Count;

        // El plan se arma durante el mismo recorrido que produce las filas, para que lo que se ve y lo
        // que se aplicaría no puedan divergir. Solo entran filas del buzón con etiqueta asignada: los
        // mensajes .eml y los candidatos escritos a mano nunca son aplicables.
        var planItems = new List<EmailApplyPlanItem>();
        Dictionary<int, string>? labelNames = null;

        // El tope se cuenta sobre lo que se examina, no sobre lo que queda visible: una fila que ya
        // tenía su etiqueta se descarta sin devolver el lugar, para que el tope siga siendo el tamaño
        // de la muestra leída y no se rellene con más mensajes de los que se pidieron.
        var examined = 0;

        // UN presupuesto para toda la muestra, construido antes del recorrido. Un contador por mensaje
        // se reiniciaría en cada vuelta y el tope de llamadas al LLM nunca se alcanzaría.
        var llmBudget = _llm?.CreateRunBudget() ?? new EmailClassificationRunBudget(_options.LlmMaxPerRun);

        for (var index = 0; index < candidates.Count; index++)
        {
            var (name, candidate) = candidates[index];
            var identity = index < remoteCount ? remote[index] : null;

            // Los mensajes del buzón ya vienen acotados por SINCE/BEFORE del servidor, que razona con
            // fechas de su propio calendario. Volver a aplicarles el rango mezcla dos calendarios y, en
            // una zona horaria negativa, descarta el último día del rango: se respeta lo que el
            // servidor devolvió. El rango sigue aplicándose a lo que se carga a mano.
            if (identity is null && IsOutOfRange(candidate, request.From, request.To))
            {
                response.SkippedOutOfRange++;
                continue;
            }

            if (examined >= maxItems)
            {
                response.SkippedByLimit++;
                continue;
            }

            examined++;

            // Determinista primero; el orquestador decide si la regla pidió el modelo (S15).
            var result = await EmailLlmClassificationService.DispatchAsync(
                _llm,
                _classification,
                userId,
                candidate,
                llmBudget,
                cancellationToken);

            // El destino es el nombre EXACTO de la etiqueta del catálogo, que debe coincidir con una
            // carpeta existente del buzón. No se infiere el nombre desde el slug: una etiqueta
            // renombrada se reporta omitida al aplicar en vez de escribir sobre una parecida.
            string? destinationName = null;
            if (identity is not null && ImapApplyPolicy.IsEligible(result) && result.LabelId is int labelId)
            {
                labelNames ??= (await _labels.GetByUserIdAsync(userId))
                    .ToDictionary(label => label.LabelId, label => label.Name);

                if (labelNames.TryGetValue(labelId, out var labelName) && !string.IsNullOrWhiteSpace(labelName))
                {
                    destinationName = labelName.Trim();
                }
            }

            // Una fila que ya tiene la etiqueta destino de SU regla no se muestra ni entra al plan:
            // no hay nada que aplicar sobre ella. El cotejo es contra esa etiqueta y no contra
            // cualquier etiqueta, y es exacto con el nombre completo (una etiqueta padre o un sello
            // del sistema como INBOX no la sustituyen).
            if (identity is not null && destinationName is not null && HasLabel(identity.Labels, destinationName))
            {
                response.SkippedAlreadyLabelled++;
                continue;
            }

            response.Rows.Add(new EmailPreviewRow
            {
                Name = name,
                SenderAddress = candidate.SenderAddress,
                SenderDomain = candidate.EffectiveSenderDomain,
                Subject = candidate.Subject,
                ReceivedAt = candidate.ReceivedAt == default ? null : candidate.ReceivedAt,
                Outcome = result.Outcome.ToString().ToLowerInvariant(),
                LabelSlug = result.LabelSlug,
                LabelBehavior = result.LabelBehavior,
                MatchedRuleName = result.MatchedRuleName,
                ClassifiedBy = result.ClassifiedBy,
                Reason = result.Reason,
                ProjectedState = result.ProjectedState
            });

            if (identity is null || destinationName is null)
            {
                // Etiqueta del catálogo desaparecida: la fila se muestra, pero no se puede aplicar.
                continue;
            }

            if (identity.UidValidity != remoteUidValidity || identity.Uid == 0)
            {
                // No debería ocurrir en una sola lectura; si ocurre, no se aplica a ciegas.
                continue;
            }

            planItems.Add(new EmailApplyPlanItem(
                name,
                identity.Uid,
                identity.UidValidity,
                identity.MessageId,
                destinationName));
        }

        response.Returned = response.Rows.Count;
        response.ApplicableCount = planItems.Count;

        if (planItems.Count > 0)
        {
            var plan = new EmailApplyPlan(
                userId,
                remoteFingerprint,
                remoteMailbox,
                remoteUidValidity,
                planItems);

            var ticket = _planStore.Store(plan);
            response.ApplyToken = ticket.Token;
            response.ApplyExpiresAt = ticket.ExpiresAt.UtcDateTime;
        }

        return response;
    }

    private static List<(string Name, EmailMessageCandidate Candidate)> BuildCandidates(
        EmailPreviewRequest request,
        EmailPreviewResponse response)
    {
        var candidates = new List<(string Name, EmailMessageCandidate Candidate)>();

        foreach (var message in request.Messages ?? new List<EmailPreviewMessageInput>())
        {
            // Un mensaje sin cabeceras legibles se cuenta y se nombra, no se descarta en silencio:
            // un descarte mudo se lee como "no casó ninguna regla".
            var parsed = EmailHeaderParser.Parse(message.Raw);
            if (parsed is null)
            {
                response.Unreadable++;
                continue;
            }

            candidates.Add((string.IsNullOrWhiteSpace(message.Name) ? "message" : message.Name.Trim(), parsed));
        }

        foreach (var candidate in request.Candidates ?? new List<EmailPreviewCandidateInput>())
        {
            candidates.Add((
                string.IsNullOrWhiteSpace(candidate.Name) ? "candidate" : candidate.Name.Trim(),
                new EmailMessageCandidate(
                    candidate.SenderAddress,
                    candidate.SenderDomain,
                    candidate.Subject,
                    candidate.ReceivedAt ?? default,
                    candidate.BodyText)));
        }

        return candidates;
    }

    /// <summary>
    /// Si el mensaje ya tiene esa etiqueta. La comparación es <see cref="StringComparison.Ordinal"/> y
    /// sobre el nombre completo de la carpeta: «Gastos» no es «Gastos/2026», y una etiqueta ausente del
    /// resumen (servidor sin extensión de etiquetas) nunca coincide.
    /// </summary>
    private static bool HasLabel(IReadOnlyList<string> labels, string destinationName)
    {
        for (var index = 0; index < labels.Count; index++)
        {
            if (string.Equals(labels[index], destinationName, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Un candidato sin fecha no se filtra por rango: no hay dato que comparar. Es la misma regla
    /// que el corte de antigüedad, y por la misma razón.
    /// </summary>
    private static bool IsOutOfRange(EmailMessageCandidate candidate, DateTime? from, DateTime? to)
    {
        if (candidate.ReceivedAt == default)
        {
            return false;
        }

        if (from.HasValue && candidate.ReceivedAt < from.Value)
        {
            return true;
        }

        return to.HasValue && candidate.ReceivedAt > to.Value;
    }
}
