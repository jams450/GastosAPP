using GastosApp.API.Configuration;
using GastosApp.BusinessLogic.Models.Email;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using MailKit.Security;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Email;

/// <summary>
/// Cliente IMAP. La lectura es de solo lectura y la escritura es una sola operación: <b>agregar una
/// etiqueta existente</b> a los mensajes de la muestra revisada.
/// <para>
/// La promesa de la lectura se sostiene en dos decisiones que conviene no perder: el buzón se abre con
/// <see cref="FolderAccess.ReadOnly"/>, así el servidor rechaza cualquier STORE, y se piden
/// <c>Envelope</c> e <c>InternalDate</c> en vez del cuerpo. Pedir el cuerpo con <c>BODY[]</c> marcaría
/// el mensaje como leído, que es justo lo que no queremos en el correo del usuario.
/// </para>
/// <para>
/// La escritura abre el mismo buzón en <see cref="FolderAccess.ReadWrite"/> y verifica antes de tocar
/// nada que el UIDVALIDITY siga siendo el de la vista previa. Solo hay <c>AddLabels</c>: no se crea,
/// no se mueve, no se borra y no se expunge. <c>DisconnectAsync(true)</c> es un LOGOUT, no un EXPUNGE.
/// </para>
/// </summary>
public sealed class ImapMailboxSource : IImapMailboxSource, IImapDailyMailboxSource, IImapLabelApplier
{
    private const int HardMaxMessages = 200;

    /// <summary>El pase diario siempre mira INBOX: el alcance elegido no depende de la configuración.</summary>
    private const string DailyMailbox = "INBOX";

    private readonly ImapOptions _options;
    private readonly ILogger<ImapMailboxSource> _logger;

    public ImapMailboxSource(IOptions<ImapOptions> options, ILogger<ImapMailboxSource> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public bool IsConfigured => _options.IsUsable;

    public async Task<IReadOnlyList<string>> ListMailboxesAsync(CancellationToken cancellationToken)
    {
        if (!_options.IsUsable)
        {
            return Array.Empty<string>();
        }

        using var client = await ConnectAsync(cancellationToken);

        // Gmail expone cada etiqueta como una carpeta; GetFolders ya devuelve la lista plana con los
        // nombres completos, incluidos los anidados bajo [Gmail].
        return client
            .GetFolders(client.PersonalNamespaces[0])
            .Select(folder => folder.FullName)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<ImapPreviewResult> FetchAsync(
        ImapFetchRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!_options.IsUsable)
        {
            throw new InvalidOperationException("La conexión IMAP no está configurada.");
        }

        var max = Math.Clamp(request.MaxMessages, 1, HardMaxMessages);
        var mailboxName = string.IsNullOrWhiteSpace(request.Mailbox) ? _options.DefaultMailbox : request.Mailbox!;
        var fingerprint = ImapAccountFingerprint.From(_options);

        using var client = await ConnectAsync(cancellationToken);
        var folder = await client.GetFolderAsync(mailboxName, cancellationToken);
        await folder.OpenAsync(FolderAccess.ReadOnly, cancellationToken);

        // El UIDVALIDITY se lee en esta misma conexión y viaja con cada mensaje: si el buzón se
        // reconstruye entre la muestra y la aplicación, los UID de la muestra dejan de nombrar los
        // mismos mensajes y la política rechaza el plan completo.
        var uidValidity = folder.UidValidity;

        var query = SearchQuery.All;
        if (request.From.HasValue)
        {
            query = query.And(SearchQuery.DeliveredAfter(request.From.Value.Date));
        }

        if (request.To.HasValue)
        {
            // DeliveredBefore es exclusivo: +1 día para que "hasta" incluya el día elegido.
            query = query.And(SearchQuery.DeliveredBefore(request.To.Value.Date.AddDays(1)));
        }

        var uids = await folder.SearchAsync(query, cancellationToken);
        if (uids.Count == 0)
        {
            return new ImapPreviewResult(mailboxName, uidValidity, fingerprint, Array.Empty<ImapPreviewMessage>());
        }

        // "Los últimos N" son los N más recientes: el orden de IMAP es del más viejo al más nuevo.
        var take = uids.Skip(Math.Max(0, uids.Count - max)).ToList();

        // Las etiquetas actuales del mensaje solo existen si el servidor anuncia la extensión de
        // etiquetas de Gmail; se piden únicamente en ese caso para no cambiar la lectura de un buzón
        // IMAP normal. Sin ellas la muestra no descarta ninguna fila por estar ya etiquetada.
        var summaryItems =
            MessageSummaryItems.UniqueId | MessageSummaryItems.Envelope | MessageSummaryItems.InternalDate;
        if (client.Capabilities.HasFlag(ImapCapabilities.GMailExt1))
        {
            summaryItems |= MessageSummaryItems.GMailLabels;
        }

        var summaries = await folder.FetchAsync(take, summaryItems, cancellationToken);

        var messages = new List<ImapPreviewMessage>(summaries.Count);
        foreach (var summary in summaries)
        {
            var candidate = Map(summary);
            if (candidate is null)
            {
                continue;
            }

            messages.Add(new ImapPreviewMessage(
                candidate,
                summary.UniqueId.Id,
                uidValidity,
                summary.Envelope?.MessageId,
                fingerprint)
            {
                Labels = CopyLabels(summary.GMailLabels)
            });
        }

        _logger.LogInformation(
            "IMAP read {Count} messages from {Mailbox} (read-only)",
            messages.Count,
            mailboxName);

        return new ImapPreviewResult(mailboxName, uidValidity, fingerprint, messages);
    }

    public async Task<ImapDailyFetchResult> FetchUnlabelledAsync(
        ImapDailyFetchRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!_options.IsUsable)
        {
            throw new EmailApplyRefusedException(
                EmailApplyRefusalCode.NotConfigured,
                "La conexión IMAP no está configurada, así que no hay buzón que revisar.");
        }

        var max = Math.Clamp(request.MaxMessages, 1, EmailIngestWindow.MaxScannedPerRun);
        var fingerprint = ImapAccountFingerprint.From(_options);

        using var client = await ConnectAsync(cancellationToken);

        // Falla cerrado antes de buscar: sin la extensión de etiquetas no se sabe qué etiquetas tiene
        // un mensaje, y un pase «a ciegas» etiquetaría correo que el usuario ya clasificó.
        if (!client.Capabilities.HasFlag(ImapCapabilities.GMailExt1))
        {
            throw new EmailApplyRefusedException(
                EmailApplyRefusalCode.MissingCapability,
                "El buzón no anuncia la extensión de etiquetas de Gmail, así que el pase diario no puede confirmar qué correo está sin etiquetar.");
        }

        var folder = await client.GetFolderAsync(DailyMailbox, cancellationToken);
        await folder.OpenAsync(FolderAccess.ReadOnly, cancellationToken);

        var uidValidity = folder.UidValidity;

        // Las carpetas se enumeran en esta misma conexión: la lista de etiquetas de usuario con la
        // que se valida cada instantánea GMailLabels es la que existe ahora, no una copia vieja.
        var folders = client
            .GetFolders(client.PersonalNamespaces[0])
            .Select(target => new ImapTargetFolder(target.FullName, target.Attributes))
            .ToList();

        // Prefiltro del servidor (X-GM-RAW). Su semántica exacta no se pudo verificar sin un buzón
        // real, así que ahorra ancho de banda pero NO es la verdad: cada mensaje se valida de nuevo
        // contra las carpetas de usuario enumeradas arriba.
        var matching = await folder.SearchAsync(
            SearchQuery.GMailRawSearch("has:nouserlabels"),
            cancellationToken);

        var sorted = matching
            .Select(uid => uid.Id)
            .OrderBy(id => id)
            .Distinct()
            .ToArray();

        // Un cursor de otra cuenta u otro UIDVALIDITY no nombra este buzón: se ignora y se empieza
        // de nuevo en lugar de saltarse correo.
        var cursorMatches = string.Equals(request.StartAfterFingerprint, fingerprint, StringComparison.Ordinal)
            && request.StartAfterUidValidity == uidValidity;

        var window = EmailIngestWindow.Select(sorted, cursorMatches ? request.StartAfterUid : null, max);

        if (window.Count == 0)
        {
            return new ImapDailyFetchResult(
                DailyMailbox,
                uidValidity,
                fingerprint,
                folders,
                Array.Empty<ImapPreviewMessage>(),
                null,
                sorted.Length);
        }

        var summaries = await folder.FetchAsync(
            window.Select(id => new UniqueId(id)).ToList(),
            MessageSummaryItems.UniqueId
            | MessageSummaryItems.Envelope
            | MessageSummaryItems.InternalDate
            | MessageSummaryItems.GMailLabels,
            cancellationToken);

        var messages = new List<ImapPreviewMessage>(summaries.Count);
        foreach (var summary in summaries)
        {
            var candidate = Map(summary);
            if (candidate is null)
            {
                continue;
            }

            messages.Add(new ImapPreviewMessage(
                candidate,
                summary.UniqueId.Id,
                uidValidity,
                summary.Envelope?.MessageId,
                fingerprint)
            {
                Labels = CopyLabels(summary.GMailLabels)
            });
        }

        _logger.LogInformation(
            "IMAP daily read {Count} of {Matching} unlabelled INBOX messages (read-only)",
            messages.Count,
            sorted.Length);

        return new ImapDailyFetchResult(
            DailyMailbox,
            uidValidity,
            fingerprint,
            folders,
            messages,
            window[^1],
            sorted.Length);
    }

    public async Task<ImapApplyResult> ApplyAsync(EmailApplyPlan plan, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(plan);

        if (!_options.IsUsable)
        {
            throw new EmailApplyRefusedException(
                EmailApplyRefusalCode.NotConfigured,
                "La conexión IMAP no está configurada, así que no hay buzón donde aplicar la muestra.");
        }

        var accountRefusal = ImapApplyPolicy.ValidateAccount(
            plan.AccountFingerprint,
            ImapAccountFingerprint.From(_options));

        if (accountRefusal is not null)
        {
            throw new EmailApplyRefusedException(EmailApplyRefusalCode.AccountChanged, accountRefusal);
        }

        ImapClient client;
        try
        {
            client = await ConnectAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning("IMAP apply could not connect: {ErrorType}", exception.GetType().Name);
            throw new EmailApplyRefusedException(
                EmailApplyRefusalCode.Unreachable,
                "No se pudo conectar al buzón. Revisa host, puerto y la contraseña de aplicación.");
        }

        IMailFolder? folder = null;
        var folderOpen = false;

        try
        {
            if (!client.Capabilities.HasFlag(ImapCapabilities.GMailExt1))
            {
                throw new EmailApplyRefusedException(
                    EmailApplyRefusalCode.MissingCapability,
                    "El buzón no anuncia la extensión de etiquetas de Gmail, así que no se puede etiquetar sin mover mensajes.");
            }

            folder = await client.GetFolderAsync(plan.Mailbox, cancellationToken);
            await folder.OpenAsync(FolderAccess.ReadWrite, cancellationToken);
            folderOpen = true;

            var uidRefusal = ImapApplyPolicy.ValidateUidValidity(plan.UidValidity, folder.UidValidity);
            if (uidRefusal is not null)
            {
                throw new EmailApplyRefusedException(EmailApplyRefusalCode.UidValidityChanged, uidRefusal);
            }

            // Las carpetas se enumeran en esta misma conexión: el destino es la etiqueta que existe
            // ahora, no la que existía cuando se generó la muestra.
            var targets = client
                .GetFolders(client.PersonalNamespaces[0])
                .Select(target => new ImapTargetFolder(target.FullName, target.Attributes))
                .ToList();

            var rows = await ApplyRowsAsync(folder, targets, plan, cancellationToken);

            _logger.LogInformation(
                "IMAP applied labels on {Mailbox}: {Applied} applied, {Skipped} skipped, {Failed} failed",
                plan.Mailbox,
                rows.Count(row => row.Status == ImapApplyStatus.Applied),
                rows.Count(row => row.Status == ImapApplyStatus.Skipped),
                rows.Count(row => row.Status == ImapApplyStatus.Failed));

            return new ImapApplyResult(rows);
        }
        finally
        {
            if (folderOpen)
            {
                try
                {
                    // expunge: false. Cerrar sin expunge para no destruir nada marcado como borrado.
                    await folder!.CloseAsync(false, CancellationToken.None);
                }
                catch (Exception exception)
                {
                    _logger.LogWarning("IMAP apply could not close the mailbox cleanly: {ErrorType}", exception.GetType().Name);
                }
            }

            try
            {
                // quit: true envía LOGOUT, no EXPUNGE.
                await client.DisconnectAsync(true, CancellationToken.None);
            }
            catch (Exception exception)
            {
                _logger.LogWarning("IMAP apply could not disconnect cleanly: {ErrorType}", exception.GetType().Name);
            }

            client.Dispose();
        }
    }

    private async Task<List<ImapApplyRowOutcome>> ApplyRowsAsync(
        IMailFolder folder,
        IReadOnlyList<ImapTargetFolder> targets,
        EmailApplyPlan plan,
        CancellationToken cancellationToken)
    {
        var rows = new List<ImapApplyRowOutcome>(plan.Items.Count);

        // Las mismas carpetas enumeradas para los destinos dicen qué nombres son etiquetas de usuario
        // en esta conexión. Es la política compartida, no una segunda lista.
        var userLabelNames = EmailIngestLabelPolicy.UserLabelNames(targets);

        var uids = plan.Items.Select(item => new UniqueId(item.Uid)).Distinct().ToList();
        IReadOnlyDictionary<UniqueId, IMessageSummary> summaries;
        try
        {
            var fetched = await folder.FetchAsync(
                uids,
                MessageSummaryItems.UniqueId | MessageSummaryItems.Envelope | MessageSummaryItems.GMailLabels,
                cancellationToken);

            summaries = fetched.ToDictionary(summary => summary.UniqueId);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception) when (IsUncertainTransportFailure(exception))
        {
            // No se sabe qué mensajes se alcanzaron a leer: no se escribe nada y no se reintenta.
            _logger.LogWarning("IMAP apply could not fetch the plan: {ErrorType}", exception.GetType().Name);
            return plan.Items
                .Select(item => new ImapApplyRowOutcome(
                    item.Name,
                    item.LabelName,
                    ImapApplyStatus.Failed,
                    "No se pudo leer el estado de los mensajes; no se aplicó ninguna etiqueta."))
                .ToList();
        }

        for (var index = 0; index < plan.Items.Count; index++)
        {
            var item = plan.Items[index];
            var uid = new UniqueId(item.Uid);
            var summary = summaries.TryGetValue(uid, out var found) ? found : null;

            var target = ImapApplyPolicy.FindTarget(targets, item.LabelName);
            var alreadyLabelled = summary?.GMailLabels is { Count: > 0 } labels
                && labels.Any(label => string.Equals(label, target?.FullName ?? item.LabelName, StringComparison.Ordinal));

            // El pase diario revalida la ausencia de CUALQUIER etiqueta de usuario con la
            // instantánea recién traída. Entre la lectura y este STORE hay una ventana del servidor
            // que no se puede cerrar desde el cliente; omitir la fila es la respuesta correcta.
            var snapshot = plan.RequireUnlabelled
                ? EmailIngestLabelPolicy.Evaluate(summary?.GMailLabels, userLabelNames)
                : EmailLabelSnapshotVerdict.NoUserLabel;

            var decision = ImapApplyPolicy.Decide(
                target,
                item.LabelName,
                item.MessageId,
                summary?.Envelope?.MessageId,
                messageFound: summary is not null,
                alreadyLabelled: alreadyLabelled,
                requireUnlabelled: plan.RequireUnlabelled,
                snapshot: snapshot);

            if (!decision.Write)
            {
                rows.Add(new ImapApplyRowOutcome(item.Name, item.LabelName, decision.Status, decision.Message));
                continue;
            }

            try
            {
                // La única escritura del módulo: agregar una etiqueta existente. Es idempotente, así
                // que una fila ya etiquetada no se duplica aunque el resumen no la haya visto.
                await folder.AddLabelsAsync(
                    uid,
                    new List<string> { target!.FullName },
                    silent: true,
                    cancellationToken);

                rows.Add(new ImapApplyRowOutcome(item.Name, item.LabelName, ImapApplyStatus.Applied, decision.Message));
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception) when (IsUncertainTransportFailure(exception))
            {
                // Resultado incierto: no se reintenta, ni se marca como aplicado. Las filas que faltan
                // tampoco se intentan, porque la conexión ya no es de fiar.
                _logger.LogWarning("IMAP apply lost the connection: {ErrorType}", exception.GetType().Name);

                rows.Add(new ImapApplyRowOutcome(
                    item.Name,
                    item.LabelName,
                    ImapApplyStatus.Failed,
                    "No se pudo confirmar la etiqueta; no se reintentó."));

                rows.AddRange(plan.Items
                    .Skip(index + 1)
                    .Select(remaining => new ImapApplyRowOutcome(
                        remaining.Name,
                        remaining.LabelName,
                        ImapApplyStatus.Failed,
                        "No se intentó por un fallo de conexión; vuelve a generar la muestra.")));

                break;
            }
            catch (Exception exception)
            {
                // Fallo esperado de una fila (por ejemplo, comando rechazado): se reporta y se sigue.
                _logger.LogWarning("IMAP apply failed for one message: {ErrorType}", exception.GetType().Name);
                rows.Add(new ImapApplyRowOutcome(
                    item.Name,
                    item.LabelName,
                    ImapApplyStatus.Failed,
                    "No se pudo aplicar la etiqueta a este mensaje."));
            }
        }

        return rows;
    }

    private static bool IsUncertainTransportFailure(Exception exception) =>
        exception is IOException or TimeoutException or ProtocolException or ServiceNotConnectedException or FolderNotOpenException;

    /// <summary>
    /// Copia las etiquetas del resumen a una lista propia: el resumen pertenece a la conexión y no
    /// debe sobrevivir en el plan que se guarda para aplicar después.
    /// </summary>
    private static IReadOnlyList<string> CopyLabels(IList<string>? labels) =>
        labels is { Count: > 0 } ? labels.ToArray() : Array.Empty<string>();

    private async Task<ImapClient> ConnectAsync(CancellationToken cancellationToken)
    {
        var client = new ImapClient();

        try
        {
            var security = _options.UseSsl ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls;
            await client.ConnectAsync(_options.Host, _options.Port, security, cancellationToken);
            await client.AuthenticateAsync(_options.Username, _options.Password, cancellationToken);
            return client;
        }
        catch
        {
            // Un cliente sin conectar deja el socket abierto; el using del llamador no llega a verlo.
            client.Dispose();
            throw;
        }
    }

    private static EmailMessageCandidate? Map(IMessageSummary summary)
    {
        var envelope = summary.Envelope;
        var address = envelope?.From?.Mailboxes?.FirstOrDefault()?.Address;
        var subject = envelope?.Subject;

        var received = summary.Date != default
            ? summary.Date.UtcDateTime
            : summary.InternalDate?.UtcDateTime ?? default;

        // Sin remitente y sin asunto no hay nada que clasificar; contarlo como mensaje vacío solo
        // llenaría la muestra de filas que no dicen nada.
        return address is null && subject is null
            ? null
            : new EmailMessageCandidate(address, null, subject, received);
    }
}
