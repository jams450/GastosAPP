using GastosApp.API.Configuration;
using GastosApp.BusinessLogic.Models.Email;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using MailKit.Security;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Email;

/// <summary>
/// Cliente IMAP de solo lectura. Dos decisiones sostienen esa promesa y conviene no perderlas:
/// el buzón se abre con <see cref="FolderAccess.ReadOnly"/>, así el servidor rechaza cualquier STORE,
/// y se piden <c>Envelope</c> e <c>InternalDate</c> en vez del cuerpo. Pedir el cuerpo con
/// <c>BODY[]</c> marcaría el mensaje como leído, que es justo lo que no queremos en el correo ajeno.
/// </summary>
public sealed class ImapMailboxSource : IImapMailboxSource
{
    private const int HardMaxMessages = 200;

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

    public async Task<IReadOnlyList<EmailMessageCandidate>> FetchAsync(
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

        using var client = await ConnectAsync(cancellationToken);
        var folder = await client.GetFolderAsync(mailboxName, cancellationToken);
        await folder.OpenAsync(FolderAccess.ReadOnly, cancellationToken);

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
            return Array.Empty<EmailMessageCandidate>();
        }

        // "Los últimos N" son los N más recientes: el orden de IMAP es del más viejo al más nuevo.
        var take = uids.Skip(Math.Max(0, uids.Count - max)).ToList();
        var summaries = await folder.FetchAsync(
            take,
            MessageSummaryItems.Envelope | MessageSummaryItems.InternalDate,
            cancellationToken);

        var candidates = summaries.Select(Map).Where(candidate => candidate is not null).Select(candidate => candidate!).ToList();

        _logger.LogInformation(
            "IMAP read {Count} messages from {Mailbox} (read-only)",
            candidates.Count,
            mailboxName);

        return candidates;
    }

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
