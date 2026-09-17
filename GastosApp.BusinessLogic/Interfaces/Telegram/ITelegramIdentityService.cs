using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces;

/// <summary>
/// Identidad de Telegram persistida. La siembra recibe los valores explícitamente desde el API:
/// este servicio no lee configuración ni secretos.
/// </summary>
public interface ITelegramIdentityService
{
    Task<TelegramIdentity?> GetByTelegramUserIdAsync(long telegramUserId, CancellationToken cancellationToken = default);

    Task<TelegramIdentity?> GetActiveByTelegramUserIdAsync(long telegramUserId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Devuelve la identidad existente para <paramref name="telegramUserId"/> o la crea si falta.
    /// Valida que el <paramref name="userId"/> recibido corresponda a un usuario activo.
    /// Idempotente ante reintentos/arranques concurrentes (unique en telegram_user_id).
    /// </summary>
    Task<TelegramIdentity> SeedIfMissingAsync(long telegramUserId, long telegramChatId, int userId, CancellationToken cancellationToken = default);

    Task<bool> SetActiveAsync(int telegramIdentityId, bool active, CancellationToken cancellationToken = default);
}
