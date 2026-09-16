using GastosApp.Models.Entities;
using Telegram.Bot.Types;

namespace GastosApp.API.Services.Telegram;

public interface ITelegramUpdateService
{
    /// <summary>
    /// Procesa el update ya autorizado. Reclama el ledger antes de ejecutar y solo marca
    /// <c>done</c> cuando el procesamiento local terminó.
    /// </summary>
    Task HandleAsync(Update update, TelegramIdentity identity, CancellationToken cancellationToken);
}
