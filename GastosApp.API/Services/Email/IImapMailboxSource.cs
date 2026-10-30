using GastosApp.BusinessLogic.Models.Email;

namespace GastosApp.API.Services.Email;

/// <summary>Qué se quiere leer del buzón. <c>Mailbox</c> nulo usa el buzón por defecto configurado.</summary>
public sealed record ImapFetchRequest(string? Mailbox, int MaxMessages, DateTime? From, DateTime? To);

/// <summary>
/// Un mensaje leído del buzón con la identidad que hace falta para escribir después sobre él: el UID
/// solo vale dentro de su <see cref="UidValidity"/>, y el <c>Message-ID</c> es el único dato estable
/// del mensaje (ver L5 del plan). La huella de la cuenta dice de qué configuración salió la muestra,
/// para que un cambio de host/usuario no aplique un plan viejo sobre otro buzón.
/// </summary>
public sealed record ImapPreviewMessage(
    EmailMessageCandidate Candidate,
    uint Uid,
    uint UidValidity,
    string? MessageId,
    string AccountFingerprint)
{
    /// <summary>
    /// Etiquetas que el mensaje ya tiene en el buzón (<c>GMailLabels</c>), con el nombre completo de la
    /// carpeta. Vacío cuando el servidor no anuncia la extensión de etiquetas: en ese caso no se sabe
    /// qué etiquetas tiene el mensaje y la muestra no descarta ninguna fila por ese motivo.
    /// </summary>
    public IReadOnlyList<string> Labels { get; init; } = Array.Empty<string>();
}

/// <summary>
/// Lo que devuelve una lectura del buzón: el buzón leído, su UIDVALIDITY y los mensajes con identidad.
/// Se conserva el UIDVALIDITY a nivel de buzón porque es el que se verifica al aplicar: si cambió, los
/// UID de la muestra ya no nombran los mismos mensajes.
/// </summary>
public sealed record ImapPreviewResult(
    string Mailbox,
    uint UidValidity,
    string AccountFingerprint,
    IReadOnlyList<ImapPreviewMessage> Messages);

/// <summary>
/// Lectura del buzón real por IMAP. Es deliberadamente de solo lectura: no escribe etiquetas, no
/// marca mensajes como leídos y no mueve nada. Un pase automático se construye encima de esto, no
/// dentro.
/// </summary>
public interface IImapMailboxSource
{
    bool IsConfigured { get; }

    Task<IReadOnlyList<string>> ListMailboxesAsync(CancellationToken cancellationToken);

    Task<ImapPreviewResult> FetchAsync(ImapFetchRequest request, CancellationToken cancellationToken);
}
