namespace GastosApp.API.Services.Telegram;

/// <summary>
/// Preserves Telegram's outbox retry contract; ntfy is a best-effort mirror.
/// A mirror failure must not retry a Telegram notification already delivered.
/// </summary>
public sealed class MirroredTelegramAlertSender(
    ITelegramAlertSender telegram,
    INtfyAlertSender ntfy,
    ILogger<MirroredTelegramAlertSender> logger) : ITelegramAlertSender
{
    public async Task SendAsync(string text, CancellationToken cancellationToken = default)
    {
        await telegram.SendAsync(text, cancellationToken);
        try
        {
            await ntfy.SendAsync(text, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            // Never log the exception object: HTTP errors can contain sensitive URLs.
            logger.LogWarning("ntfy alert mirror failed: {ErrorType}", exception.GetType().Name);
        }
    }
}
