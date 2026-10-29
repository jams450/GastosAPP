using GastosApp.BusinessLogic.Models.Email;

namespace GastosApp.API.Services.Email;

/// <summary>Qué se quiere leer del buzón. <c>Mailbox</c> nulo usa el buzón por defecto configurado.</summary>
public sealed record ImapFetchRequest(string? Mailbox, int MaxMessages, DateTime? From, DateTime? To);

/// <summary>
/// Lectura del buzón real por IMAP. Es deliberadamente de solo lectura: no escribe etiquetas, no
/// marca mensajes como leídos y no mueve nada. Un pase automático se construye encima de esto, no
/// dentro.
/// </summary>
public interface IImapMailboxSource
{
    bool IsConfigured { get; }

    Task<IReadOnlyList<string>> ListMailboxesAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<EmailMessageCandidate>> FetchAsync(ImapFetchRequest request, CancellationToken cancellationToken);
}
