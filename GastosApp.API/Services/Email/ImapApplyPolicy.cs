using GastosApp.BusinessLogic.Models.Email;
using MailKit;

namespace GastosApp.API.Services.Email;

/// <summary>Una carpeta del buzón tal como la enumeró la conexión: nombre completo y atributos.</summary>
public sealed record ImapTargetFolder(string FullName, FolderAttributes Attributes);

/// <summary>Estados por fila que expone la respuesta de aplicar.</summary>
public static class ImapApplyStatus
{
    public const string Applied = "applied";
    public const string Skipped = "skipped";
    public const string Failed = "failed";
}

/// <summary>
/// Decisión sobre una fila: si se escribe y, si no, qué estado y qué mensaje se reporta.
/// </summary>
public sealed record ImapRowDecision(bool Write, string Status, string Message);

/// <summary>
/// Política pura del etiquetado. Se separa del cliente IMAP a propósito: las reglas que evitan un
/// desastre (escribir sobre una carpeta del sistema, aplicar un plan con UID de otro UIDVALIDITY,
/// etiquetar un mensaje que cambió) se pueden probar sin abrir una conexión y sin dobles de MailKit.
/// <para>
/// Solo se <b>agrega</b> una etiqueta existente. No hay creación de etiquetas, ni movimiento, ni
/// borrado, ni expunge en ninguna rama: la lista de acciones posibles es una y está aquí.
/// </para>
/// </summary>
public static class ImapApplyPolicy
{
    /// <summary>
    /// Carpetas especiales (RFC 6154) más las de Gmail. Escribir una etiqueta de servidor sobre
    /// «All Mail», «Trash» o «Archive» archiva o borra correo del usuario, que es justo el efecto que
    /// esta función no debe tener.
    /// </summary>
    private const FolderAttributes SystemAttributes =
        FolderAttributes.All |
        FolderAttributes.Archive |
        FolderAttributes.Drafts |
        FolderAttributes.Flagged |
        FolderAttributes.Important |
        FolderAttributes.Inbox |
        FolderAttributes.Junk |
        FolderAttributes.Sent |
        FolderAttributes.Trash;

    /// <summary>
    /// Una fila solo se puede aplicar si el clasificador le asignó una etiqueta real. Es lo que
    /// incluye las etiquetas con comportamiento <c>ignore</c> y <c>none</c> y deja fuera
    /// <c>too_old</c> y <c>no_match</c>, que no nombran ninguna etiqueta.
    /// </summary>
    public static bool IsEligible(EmailClassificationResult result)
    {
        ArgumentNullException.ThrowIfNull(result);
        return result.LabelId.HasValue;
    }

    /// <summary>
    /// Busca la carpeta destino por nombre exacto (<see cref="StringComparison.Ordinal"/>). No se
    /// infiere el nombre desde un slug: la etiqueta del catálogo se llama como la carpeta de Gmail, y
    /// si no coincide se reporta omitida en vez de escribir sobre una etiqueta parecida.
    /// </summary>
    public static ImapTargetFolder? FindTarget(IEnumerable<ImapTargetFolder> folders, string labelName)
    {
        if (string.IsNullOrWhiteSpace(labelName))
        {
            return null;
        }

        return folders.FirstOrDefault(folder =>
            string.Equals(folder.FullName, labelName, StringComparison.Ordinal) && IsUserLabel(folder));
    }

    /// <summary>
    /// Si la carpeta es una etiqueta de usuario escribible. Se rechazan las carpetas del sistema, las
    /// no seleccionables, los marcadores sin mensajes y los nombres reservados de Gmail.
    /// </summary>
    public static bool IsUserLabel(ImapTargetFolder folder)
    {
        ArgumentNullException.ThrowIfNull(folder);

        if (string.IsNullOrWhiteSpace(folder.FullName))
        {
            return false;
        }

        if ((folder.Attributes & SystemAttributes) != 0)
        {
            return false;
        }

        if (folder.Attributes.HasFlag(FolderAttributes.NoSelect)
            || folder.Attributes.HasFlag(FolderAttributes.NonExistent))
        {
            return false;
        }

        var name = folder.FullName.Trim();

        if (string.Equals(name, "INBOX", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        // Las etiquetas de sistema de Gmail viven bajo [Gmail]; las locales también, con otro idioma.
        return !name.StartsWith("[Gmail]", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Si el nombre es una etiqueta del sistema de Gmail y no una etiqueta creada por el usuario. Se
    /// reconocen las banderas del servidor (<c>\Inbox</c>, <c>\Important</c>, <c>\Read</c>…), el
    /// buzón <c>INBOX</c> y las carpetas/categorías de Gmail bajo <c>[Gmail]</c>. Un nombre vacío no
    /// identifica una etiqueta de usuario y también se rechaza.
    /// </summary>
    public static bool IsSystemLabelName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return true;
        }

        var trimmed = name.Trim();

        // Banderas del servidor: \Inbox, \Important, \Read, \Starred, \Sent, \Trash…
        if (trimmed[0] == '\\')
        {
            return true;
        }

        if (string.Equals(trimmed, "INBOX", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        // Carpetas y categorías propias de Gmail, en cualquier idioma.
        return trimmed.StartsWith("[Gmail]", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Decisión por fila, en el orden en que importa: primero la identidad del mensaje, después la
    /// etiqueta destino. Un <c>Message-ID</c> ausente falla cerrado: sin él no hay forma de confirmar
    /// que el UID sigue nombrando el mensaje que la persona revisó.
    /// </summary>
    /// <param name="requireUnlabelled">
    /// Exige que la instantánea actual no tenga etiquetas de usuario. Lo usa el pase diario.
    /// </param>
    /// <param name="snapshot">
    /// Veredicto de <see cref="EmailIngestLabelPolicy.Evaluate"/> sobre la instantánea leída en la
    /// misma conexión. Se ignora por completo cuando <paramref name="requireUnlabelled"/> es
    /// <c>false</c>, que es el comportamiento histórico del módulo manual.
    /// </param>
    public static ImapRowDecision Decide(
        ImapTargetFolder? target,
        string labelName,
        string? expectedMessageId,
        string? actualMessageId,
        bool messageFound,
        bool alreadyLabelled,
        bool requireUnlabelled = false,
        EmailLabelSnapshotVerdict snapshot = EmailLabelSnapshotVerdict.NoUserLabel)
    {
        if (!messageFound)
        {
            return new ImapRowDecision(false, ImapApplyStatus.Failed, "El mensaje ya no está en el buzón; no se etiquetó.");
        }

        if (string.IsNullOrWhiteSpace(expectedMessageId))
        {
            return new ImapRowDecision(false, ImapApplyStatus.Failed, "No se pudo verificar la identidad del mensaje (Message-ID ausente); no se etiquetó.");
        }

        if (!MessageIdMatches(expectedMessageId, actualMessageId))
        {
            return new ImapRowDecision(false, ImapApplyStatus.Failed, "El mensaje cambió desde la vista previa; no se etiquetó.");
        }

        if (target is null)
        {
            return new ImapRowDecision(false, ImapApplyStatus.Skipped, $"La etiqueta «{labelName}» no existe en el buzón; no se crean etiquetas.");
        }

        if (!IsUserLabel(target))
        {
            return new ImapRowDecision(false, ImapApplyStatus.Skipped, $"«{target.FullName}» es una carpeta del sistema; no se escribe ahí.");
        }

        if (alreadyLabelled)
        {
            return new ImapRowDecision(false, ImapApplyStatus.Skipped, "El mensaje ya tenía la etiqueta.");
        }

        // Revalidación previa a CADA escritura del pase diario: la instantánea se leyó en la misma
        // conexión, pero entre esa lectura y el STORE el usuario pudo etiquetar el correo desde otro
        // cliente. Reducir la carrera no es volverla atómica; por eso el mensaje lo dice.
        if (requireUnlabelled && snapshot == EmailLabelSnapshotVerdict.HasUserLabel)
        {
            return new ImapRowDecision(false, ImapApplyStatus.Skipped, "El mensaje ya tiene una etiqueta de usuario; no se etiquetó.");
        }

        if (requireUnlabelled && snapshot == EmailLabelSnapshotVerdict.UnknownLabel)
        {
            return new ImapRowDecision(false, ImapApplyStatus.Skipped, "No se pudo confirmar que el mensaje no tuviera etiquetas; no se etiquetó.");
        }

        return new ImapRowDecision(true, ImapApplyStatus.Applied, "Etiqueta aplicada.");
    }

    /// <summary>Rechazo previo al plan completo si el UIDVALIDITY del buzón cambió.</summary>
    public static string? ValidateUidValidity(uint planUidValidity, uint actualUidValidity)
    {
        return planUidValidity == actualUidValidity
            ? null
            : "El buzón cambió desde la vista previa (UIDVALIDITY distinto). Vuelve a generar la muestra.";
    }

    /// <summary>Rechazo previo al plan completo si la cuenta configurada es otra.</summary>
    public static string? ValidateAccount(string? planFingerprint, string? currentFingerprint)
    {
        return string.Equals(planFingerprint, currentFingerprint, StringComparison.Ordinal)
            ? null
            : "La cuenta IMAP configurada cambió desde la vista previa. Vuelve a generar la muestra.";
    }

    /// <summary>
    /// Compara <c>Message-ID</c> normalizando los ángulos: con y sin <c>&lt;…&gt;</c> es el mismo
    /// mensaje, y confundirlos haría fallar toda la muestra por una diferencia de formato.
    /// </summary>
    public static bool MessageIdMatches(string? expected, string? actual)
    {
        var left = Normalize(expected);
        var right = Normalize(actual);

        return left.Length > 0 && string.Equals(left, right, StringComparison.Ordinal);
    }

    private static string Normalize(string? messageId)
    {
        if (string.IsNullOrWhiteSpace(messageId))
        {
            return string.Empty;
        }

        return messageId.Trim().Trim('<', '>').Trim();
    }
}
