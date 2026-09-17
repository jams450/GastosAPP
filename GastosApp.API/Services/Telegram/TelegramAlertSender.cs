using GastosApp.API.Configuration;
using Microsoft.Extensions.Options;
using Telegram.Bot;

namespace GastosApp.API.Services.Telegram;

/// <summary>
/// Envía alertas al <c>Telegram:AllowedUserId</c> como <c>chat_id</c>. El token y el payload
/// nunca se registran: los errores de Telegram.Bot pueden incluir la URL con el token.
/// </summary>
public sealed class TelegramAlertSender : ITelegramAlertSender
{
    private const int TelegramMessageLimit = 4000;

    private readonly TelegramOptions _options;
    private ITelegramBotClient? _client;

    public TelegramAlertSender(IOptions<TelegramOptions> options)
    {
        _options = options.Value;
    }

    public async Task SendAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text)) return;

        if (_options.AllowedUserId <= 0 || string.IsNullOrWhiteSpace(_options.BotToken))
        {
            throw new InvalidOperationException("Telegram alert sender is not configured.");
        }

        if (text.Length > TelegramMessageLimit)
        {
            text = text[..TelegramMessageLimit];
        }

        var client = _client ??= new TelegramBotClient(_options.BotToken);
        await client.SendMessage(_options.AllowedUserId, text, cancellationToken: cancellationToken);
    }
}
