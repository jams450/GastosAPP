using GastosApp.API.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Telegram.Bot;
using Telegram.Bot.Types;

namespace GastosApp.API.Services.Telegram;

public sealed class TelegramUpdateService : ITelegramUpdateService
{
    private const int TelegramMessageLimit = 4000;
    private readonly ExpenseAgentService _agent;
    private readonly IOptions<TelegramOptions> _options;
    private readonly ILogger<TelegramUpdateService> _logger;

    public TelegramUpdateService(
        ExpenseAgentService agent,
        IOptions<TelegramOptions> options,
        ILogger<TelegramUpdateService> logger)
    {
        _agent = agent;
        _options = options;
        _logger = logger;
    }

    public async Task HandleAsync(Update update, CancellationToken cancellationToken)
    {
        var options = _options.Value;
        var message = update.Message;
        if (!options.Enabled || message?.Chat is null || string.IsNullOrWhiteSpace(message.Text)) return;

        try
        {
            var response = await _agent.RespondAsync(message.Text, cancellationToken);
            response = string.IsNullOrWhiteSpace(response)
                ? "No pude generar una respuesta. Intenta de nuevo."
                : response[..Math.Min(response.Length, TelegramMessageLimit)];

            var bot = new TelegramBotClient(options.BotToken);
            await bot.SendMessage(message.Chat.Id, response, cancellationToken: cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Telegram update processing failed.");
        }
    }
}
