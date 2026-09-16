using GastosApp.API.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Telegram.Bot;
using Telegram.Bot.Types;

namespace GastosApp.API.Services.Telegram;

/// <summary>
/// Cliente del bot construido una sola vez por servicio (scoped). El token nunca se loguea
/// ni se expone en mensajes de error.
/// </summary>
public sealed class TelegramBotClientProvider
{
    private const int TelegramMessageLimit = 4000;

    private readonly TelegramOptions _options;
    private readonly ILogger<TelegramBotClientProvider> _logger;
    private ITelegramBotClient? _client;

    public TelegramBotClientProvider(IOptions<TelegramOptions> options, ILogger<TelegramBotClientProvider> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task TrySendAsync(long chatId, string text, long updateId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(text)) return;

        if (text.Length > TelegramMessageLimit)
        {
            text = text[..TelegramMessageLimit];
        }

        try
        {
            var client = _client ??= new TelegramBotClient(_options.BotToken);
            await client.SendMessage(chatId, text, cancellationToken: cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            // Solo el tipo de excepción: los errores de Telegram.Bot pueden incluir la URL con el token.
            _logger.LogWarning("Telegram send failed for update {UpdateId}: {ErrorType}", updateId, exception.GetType().Name);
        }
    }
}
