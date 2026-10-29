namespace GastosApp.API.Configuration;

/// <summary>
/// Configuración de la conexión IMAP (<c>Email:Imap</c> en appsettings o variables de entorno).
/// Se enlaza sin validación de arranque, igual que <c>LlmOptions</c>: una configuración de correo
/// incompleta no debe impedir que la API arranque, solo deja la función apagada.
/// </summary>
public sealed class ImapOptions
{
    public const string SectionName = "Email:Imap";

    public string Host { get; set; } = "imap.gmail.com";

    public int Port { get; set; } = 993;

    /// <summary>Gmail exige TLS implícito en el puerto 993.</summary>
    public bool UseSsl { get; set; } = true;

    public string Username { get; set; } = string.Empty;

    /// <summary>
    /// Contraseña de aplicación de Gmail, no la del usuario: con 2FA activo la contraseña normal no
    /// se puede usar para IMAP. Se guarda solo en la configuración del servidor, nunca en la base.
    /// </summary>
    public string Password { get; set; } = string.Empty;

    /// <summary>Buzón por defecto cuando la petición no pide uno.</summary>
    public string DefaultMailbox { get; set; } = "INBOX";

    /// <summary>
    /// Indica si la conexión se puede intentar. Un placeholder <c>SET_FROM_ENV</c> cuenta como no
    /// configurado: es la convención del repo para no arrancar con secretos falsos.
    /// </summary>
    public bool IsUsable =>
        !string.IsNullOrWhiteSpace(Host) &&
        Port > 0 &&
        !string.IsNullOrWhiteSpace(Username) &&
        !IsPlaceholder(Password);

    private static bool IsPlaceholder(string value) =>
        string.IsNullOrWhiteSpace(value) || value.StartsWith("SET_", StringComparison.OrdinalIgnoreCase);
}
