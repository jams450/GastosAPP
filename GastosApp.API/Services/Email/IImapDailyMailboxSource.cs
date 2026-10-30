namespace GastosApp.API.Services.Email;

/// <summary>
/// Petición del pase diario: solo INBOX, solo correo sin etiquetas de usuario del servidor.
/// <para>
/// El cursor viaja con la identidad que lo produjo. Si la huella o el UIDVALIDITY no coinciden con la
/// conexión actual, el lector ignora el cursor y empieza de nuevo: un UID de otro buzón no nombra
/// nada aquí.
/// </para>
/// </summary>
public sealed record ImapDailyFetchRequest(
    string? StartAfterFingerprint,
    uint StartAfterUidValidity,
    uint? StartAfterUid,
    int MaxMessages);

/// <summary>
/// Lectura acotada del pase diario. Incluye la identidad del buzón, las carpetas enumeradas en la
/// misma conexión y el último UID examinado, para que el cursor avance incluso cuando ninguna fila
/// recibe veredicto.
/// </summary>
public sealed record ImapDailyFetchResult(
    string Mailbox,
    uint UidValidity,
    string AccountFingerprint,
    IReadOnlyList<ImapTargetFolder> UserLabelFolders,
    IReadOnlyList<ImapPreviewMessage> Messages,
    uint? LastScannedUid,
    int MatchingMessages);

/// <summary>
/// Lectura dedicada al pase diario de etiquetado. Es una interfaz aparte de
/// <see cref="IImapMailboxSource"/> a propósito: el muestreo manual conserva su comportamiento
/// («los últimos N» del buzón pedido) y el pase automático busca únicamente INBOX sin etiquetas de
/// usuario.
/// <para>
/// Exige la extensión de etiquetas de Gmail: sin ella no se sabe qué etiquetas tiene un mensaje y el
/// pase falla cerrado, sin un pase alternativo que pudiera etiquetar correo ya etiquetado.
/// </para>
/// </summary>
public interface IImapDailyMailboxSource
{
    bool IsConfigured { get; }

    /// <summary>
    /// Lee una ventana acotada de INBOX sin etiquetas de usuario. Es de solo lectura y nunca escribe
    /// etiquetas; la escritura vive en <see cref="IImapLabelApplier"/>.
    /// </summary>
    Task<ImapDailyFetchResult> FetchUnlabelledAsync(
        ImapDailyFetchRequest request,
        CancellationToken cancellationToken);
}
