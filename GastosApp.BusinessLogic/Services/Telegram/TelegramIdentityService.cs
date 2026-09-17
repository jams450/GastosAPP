using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services;

public class TelegramIdentityService : ITelegramIdentityService
{
    private readonly IRepository _repository;

    public TelegramIdentityService(IRepository repository)
    {
        _repository = repository;
    }

    public Task<TelegramIdentity?> GetByTelegramUserIdAsync(long telegramUserId, CancellationToken cancellationToken = default)
    {
        return _repository.Get<TelegramIdentity>(i => i.TelegramUserId == telegramUserId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public Task<TelegramIdentity?> GetActiveByTelegramUserIdAsync(long telegramUserId, CancellationToken cancellationToken = default)
    {
        // La identidad solo está activa si su usuario de Gastos también lo está:
        // desactivar el usuario invalida cualquier identidad de Telegram vigente.
        return _repository.Get<TelegramIdentity>(i => i.TelegramUserId == telegramUserId && i.Active && i.User.Active)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<TelegramIdentity> SeedIfMissingAsync(long telegramUserId, long telegramChatId, int userId, CancellationToken cancellationToken = default)
    {
        if (telegramUserId <= 0)
        {
            throw new ArgumentException("El telegram_user_id es obligatorio.", nameof(telegramUserId));
        }

        if (telegramChatId == 0)
        {
            throw new ArgumentException("El telegram_chat_id es obligatorio.", nameof(telegramChatId));
        }

        if (userId <= 0)
        {
            throw new ArgumentException("El user_id es obligatorio.", nameof(userId));
        }

        var existing = await GetByTelegramUserIdAsync(telegramUserId, cancellationToken);
        if (existing != null)
        {
            // Un usuario de Gastos inactivo invalida la identidad aunque la fila siga en active=true:
            // la siembra no debe reautorizar una identidad cuyo dueño fue desactivado.
            var ownerIsActive = await _repository.Get<User>(u => u.UserId == existing.UserId && u.Active)
                .AnyAsync(cancellationToken);
            if (!ownerIsActive)
            {
                throw new ArgumentException("El usuario indicado no existe o está inactivo.", nameof(userId));
            }

            return existing;
        }

        var userIsActive = await _repository.Get<User>(u => u.UserId == userId && u.Active)
            .AnyAsync(cancellationToken);
        if (!userIsActive)
        {
            throw new ArgumentException("El usuario indicado no existe o está inactivo.", nameof(userId));
        }

        var identity = new TelegramIdentity
        {
            TelegramUserId = telegramUserId,
            TelegramChatId = telegramChatId,
            UserId = userId,
            Active = true
        };

        try
        {
            return await _repository.Save(identity);
        }
        catch (DbUpdateException)
        {
            // Carrera con otra siembra concurrente: la fila ganadora ya existe (unique en telegram_user_id).
            var raced = await GetByTelegramUserIdAsync(telegramUserId, cancellationToken);
            if (raced == null)
            {
                throw;
            }

            return raced;
        }
    }

    public async Task<bool> SetActiveAsync(int telegramIdentityId, bool active, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var affected = await _repository.GetTrack<TelegramIdentity>()
            .Where(i => i.TelegramIdentityId == telegramIdentityId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(i => i.Active, active)
                .SetProperty(i => i.Updated, (DateTime?)now), cancellationToken);
        return affected > 0;
    }
}
