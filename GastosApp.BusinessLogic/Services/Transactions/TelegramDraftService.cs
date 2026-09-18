using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services;

public class TelegramDraftService : ITelegramDraftService
{
    /// <summary>TTL propuesto para un borrador pendiente cuando el llamador no fija <c>expires_at</c>.</summary>
    public static readonly TimeSpan DefaultTtl = TimeSpan.FromMinutes(15);

    private readonly IRepository _repository;
    private readonly ITransactionValidationService _validation;

    public TelegramDraftService(IRepository repository, ITransactionValidationService validation)
    {
        _repository = repository;
        _validation = validation;
    }

    public async Task<TelegramDraft> CreateAsync(TelegramDraft draft, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(draft);

        if (draft.TelegramIdentityId <= 0)
        {
            throw new ArgumentException("La identidad de Telegram es obligatoria.", nameof(draft));
        }

        if (draft.ChatId == 0)
        {
            throw new ArgumentException("El chat de Telegram es obligatorio.", nameof(draft));
        }

        if (draft.Amount <= 0)
        {
            throw new ArgumentException("El monto del borrador debe ser mayor a cero.", nameof(draft));
        }

        var now = DateTime.UtcNow;
        if (draft.DraftId == Guid.Empty)
        {
            draft.DraftId = Guid.NewGuid();
        }

        draft.Status = TelegramDraftStatus.Pending;
        draft.Intent = string.IsNullOrWhiteSpace(draft.Intent) ? TelegramDraftIntent.Expense : draft.Intent;
        draft.Source = string.IsNullOrWhiteSpace(draft.Source) ? TelegramDraftSource.Manual : draft.Source;
        draft.TransactionDate = _validation.EnsureUtc(draft.TransactionDate);
        draft.ExpiresAt = draft.ExpiresAt == default || draft.ExpiresAt <= now
            ? now + DefaultTtl
            : _validation.EnsureUtc(draft.ExpiresAt);
        draft.ConfirmedAt = null;
        draft.TransactionId = null;

        return await _repository.ExecuteInTransactionAsync(async () =>
        {
            // Serializa la creación por chat: si llegan dos updates concurrentes, el segundo espera
            // al commit del primero y su cancelación incluye al pendiente recién insertado. Evita la
            // violación del índice único parcial (un solo pending por chat) y sus rollbacks parciales.
            await _repository.LockTelegramDraftChatAsync(draft.ChatId);

            // Un solo borrador pendiente por chat: el más reciente reemplaza al anterior.
            await _repository.GetTrack<TelegramDraft>()
                .Where(d => d.ChatId == draft.ChatId && d.Status == TelegramDraftStatus.Pending)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(d => d.Status, TelegramDraftStatus.Cancelled)
                    .SetProperty(d => d.Updated, (DateTime?)now), cancellationToken);

            _repository.GetTrack<TelegramDraft>().Add(draft);
            await _repository.SaveChangesAsync();
            return draft;
        });
    }

    public async Task<TelegramDraft?> GetAsync(Guid draftId, CancellationToken cancellationToken = default)
    {
        return await _repository.GetByIdAsync<TelegramDraft>(draftId);
    }

    public async Task<TelegramDraft?> GetPendingAsync(long chatId, CancellationToken cancellationToken = default)
    {
        return await _repository.Get<TelegramDraft>(d => d.ChatId == chatId && d.Status == TelegramDraftStatus.Pending)
            .OrderByDescending(d => d.ExpiresAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<bool> CancelAsync(long chatId, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var affected = await _repository.GetTrack<TelegramDraft>()
            .Where(d => d.ChatId == chatId && d.Status == TelegramDraftStatus.Pending)
            .ExecuteUpdateAsync(s => s
                .SetProperty(d => d.Status, TelegramDraftStatus.Cancelled)
                .SetProperty(d => d.Updated, (DateTime?)now), cancellationToken);
        return affected > 0;
    }

    public async Task<int> ExpireStaleAsync(DateTime utcNow, CancellationToken cancellationToken = default)
    {
        var now = utcNow == default ? DateTime.UtcNow : utcNow;
        return await _repository.GetTrack<TelegramDraft>()
            .Where(d => d.Status == TelegramDraftStatus.Pending && d.ExpiresAt <= now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(d => d.Status, TelegramDraftStatus.Expired)
                .SetProperty(d => d.Updated, (DateTime?)now), cancellationToken);
    }

    public async Task<int> PurgeAsync(DateTime expiresBefore, CancellationToken cancellationToken = default)
    {
        return await _repository.GetTrack<TelegramDraft>()
            .Where(d => d.Status != TelegramDraftStatus.Pending && d.ExpiresAt < expiresBefore)
            .ExecuteDeleteAsync(cancellationToken);
    }

    public async Task<TelegramDraftConfirmationResult> ConfirmAsync(
        Guid draftId,
        long chatId,
        Func<TelegramDraft, Task<Transaction>> createExpense,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(createExpense);

        return await _repository.ExecuteInTransactionAsync(async () =>
        {
            var draft = await _repository.LockTelegramDraftAsync(draftId);
            if (draft == null || draft.ChatId != chatId)
            {
                return new TelegramDraftConfirmationResult(TelegramDraftConfirmationOutcome.NotFound, null, null);
            }

            if (draft.Status != TelegramDraftStatus.Pending)
            {
                return new TelegramDraftConfirmationResult(TelegramDraftConfirmationOutcome.NotPending, draft, null);
            }

            var now = DateTime.UtcNow;
            if (draft.ExpiresAt <= now)
            {
                draft.Status = TelegramDraftStatus.Expired;
                await _repository.SaveChangesAsync();
                return new TelegramDraftConfirmationResult(TelegramDraftConfirmationOutcome.Expired, draft, null);
            }

            // El callback debe usar ITransactionService: reutiliza esta misma transacción
            // (IRepository.ExecuteInTransactionAsync detecta CurrentTransaction).
            var transaction = await createExpense(draft);
            if (transaction == null)
            {
                throw new InvalidOperationException("La confirmación del borrador no devolvió una transacción.");
            }

            draft.Status = TelegramDraftStatus.Confirmed;
            draft.ConfirmedAt = now;
            draft.TransactionId = transaction.TransactionId;
            await _repository.SaveChangesAsync();

            return new TelegramDraftConfirmationResult(TelegramDraftConfirmationOutcome.Confirmed, draft, transaction);
        });
    }
}
