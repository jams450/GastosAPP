namespace GastosApp.API.Services.Telegram;

/// <summary>
/// Envío de alertas al único destino permitido (<c>Telegram:AllowedUserId</c>).
/// El <c>chat_id</c> nunca proviene de la base de datos ni del request.
/// </summary>
public interface ITelegramAlertSender
{
    /// <summary>
    /// Envía <paramref name="text"/> al <c>AllowedUserId</c>. Lanza en cualquier fallo:
    /// el llamador decide el reintento y solo registra el tipo de la excepción.
    /// </summary>
    Task SendAsync(string text, CancellationToken cancellationToken = default);
}
