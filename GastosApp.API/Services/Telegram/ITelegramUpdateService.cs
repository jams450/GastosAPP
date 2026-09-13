using Telegram.Bot.Types;

namespace GastosApp.API.Services.Telegram;

public interface ITelegramUpdateService
{
    Task HandleAsync(Update update, CancellationToken cancellationToken);
}
