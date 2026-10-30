namespace GastosApp.API.Services.Email;

/// <summary>
/// Un renglón del plan de etiquetado: qué mensaje (UID + UIDVALIDITY + <c>Message-ID</c>) y a qué
/// etiqueta existente del buzón. El nombre de la etiqueta es el <c>FullName</c> exacto de la carpeta
/// de Gmail, no un slug inferido: crear una etiqueta nueva no está permitido.
/// </summary>
public sealed record EmailApplyPlanItem(
    string Name,
    uint Uid,
    uint UidValidity,
    string? MessageId,
    string LabelName);

/// <summary>
/// El plan completo de una muestra, atado a un usuario y a una cuenta IMAP. Es inmutable a propósito:
/// el token no autoriza a buscar correo de nuevo, solo a repetir exactamente lo que la persona revisó.
/// </summary>
/// <param name="RequireUnlabelled">
/// Cuando es <c>true</c>, el escritor exige que el mensaje siga sin NINGUNA etiqueta de usuario justo
/// antes de agregar la suya, y omite la fila si apareció una. El pase diario lo enciende; el módulo de
/// prueba manual lo deja en <c>false</c> y conserva su comportamiento anterior. No vuelve atómica la
/// comprobación: entre leer la instantánea y escribir hay una ventana del servidor.
/// </param>
public sealed record EmailApplyPlan(
    int UserId,
    string AccountFingerprint,
    string Mailbox,
    uint UidValidity,
    IReadOnlyList<EmailApplyPlanItem> Items,
    bool RequireUnlabelled = false);

/// <summary>Resultado de canjear un token: el plan, o por qué no se puede canjear.</summary>
public enum EmailApplyTakeStatus
{
    Taken,
    Missing,
    Expired,
    WrongUser
}

public sealed record EmailApplyTake(EmailApplyTakeStatus Status, EmailApplyPlan? Plan)
{
    public static EmailApplyTake Taken(EmailApplyPlan plan) => new(EmailApplyTakeStatus.Taken, plan);

    public static readonly EmailApplyTake Missing = new(EmailApplyTakeStatus.Missing, null);
    public static readonly EmailApplyTake Expired = new(EmailApplyTakeStatus.Expired, null);
    public static readonly EmailApplyTake WrongUser = new(EmailApplyTakeStatus.WrongUser, null);
}

/// <summary>Token emitido y su caducidad, que es lo que la pantalla muestra.</summary>
public sealed record EmailApplyTicket(string Token, DateTimeOffset ExpiresAt);

/// <summary>
/// Rechazo anterior a cualquier escritura. Se lanza, en lugar de devolver un resultado por fila,
/// porque no hay filas: el plan entero dejó de ser aplicable.
/// </summary>
public sealed class EmailApplyRefusedException : Exception
{
    public EmailApplyRefusedException(string code, string message) : base(message)
    {
        Code = code;
    }

    /// <summary>Código corto y estable para el log; el mensaje es el que ve la persona.</summary>
    public string Code { get; }
}

/// <summary>Códigos de rechazo, para registrar el motivo sin registrar el mensaje del servidor.</summary>
public static class EmailApplyRefusalCode
{
    public const string TokenInvalid = "token_invalid";
    public const string TokenExpired = "token_expired";
    public const string TokenForeign = "token_foreign";
    public const string NotConfigured = "imap_not_configured";
    public const string AccountChanged = "account_changed";
    public const string Unreachable = "imap_unreachable";
    public const string MissingCapability = "gmail_capability_missing";
    public const string UidValidityChanged = "uidvalidity_changed";
}
