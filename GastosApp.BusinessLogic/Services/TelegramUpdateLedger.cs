using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services;

public class TelegramUpdateLedger : ITelegramUpdateLedger
{
    public static readonly TimeSpan DefaultLease = TimeSpan.FromMinutes(5);
    public const int DefaultMaxAttempts = 5;

    private readonly IRepository _repository;
    private readonly TimeSpan _lease;
    private readonly int _maxAttempts;

    public TelegramUpdateLedger(IRepository repository)
        : this(repository, DefaultLease, DefaultMaxAttempts)
    {
    }

    public TelegramUpdateLedger(IRepository repository, TimeSpan lease, int maxAttempts)
    {
        _repository = repository;
        _lease = lease <= TimeSpan.Zero ? DefaultLease : lease;
        _maxAttempts = maxAttempts < 1 ? DefaultMaxAttempts : maxAttempts;
    }

    public async Task<TelegramUpdateClaimResult> ClaimAsync(long updateId, int? telegramIdentityId, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var claimToken = Guid.NewGuid();
        var claimed = await _repository.ClaimTelegramProcessedUpdateAsync(
            updateId, telegramIdentityId, TelegramProcessedUpdateStatus.Processing, now, claimToken);
        if (claimed)
        {
            return new TelegramUpdateClaimResult(TelegramUpdateClaimOutcome.Claimed, 1, claimToken);
        }

        var existing = await _repository.Get<TelegramProcessedUpdate>(u => u.UpdateId == updateId)
            .Select(u => new { u.Status, u.AttemptCount, u.ClaimedAt })
            .FirstOrDefaultAsync(cancellationToken);

        if (existing == null)
        {
            // La fila desapareció entre el insert y la lectura (purga concurrente): reintentar el claim.
            var retryToken = Guid.NewGuid();
            var retried = await _repository.ClaimTelegramProcessedUpdateAsync(
                updateId, telegramIdentityId, TelegramProcessedUpdateStatus.Processing, now, retryToken);
            return retried
                ? new TelegramUpdateClaimResult(TelegramUpdateClaimOutcome.Claimed, 1, retryToken)
                : new TelegramUpdateClaimResult(TelegramUpdateClaimOutcome.AlreadyProcessing, 0);
        }

        if (existing.Status == TelegramProcessedUpdateStatus.Done)
        {
            return new TelegramUpdateClaimResult(TelegramUpdateClaimOutcome.Duplicate, existing.AttemptCount);
        }

        if (existing.AttemptCount >= _maxAttempts)
        {
            return new TelegramUpdateClaimResult(TelegramUpdateClaimOutcome.Exhausted, existing.AttemptCount);
        }

        var leaseExpired = existing.Status == TelegramProcessedUpdateStatus.Processing && existing.ClaimedAt < now - _lease;
        var retryAfterFailure = existing.Status == TelegramProcessedUpdateStatus.Failed;
        if (!leaseExpired && !retryAfterFailure)
        {
            return new TelegramUpdateClaimResult(TelegramUpdateClaimOutcome.AlreadyProcessing, existing.AttemptCount);
        }

        var leaseCutoff = now - _lease;
        var reclaimToken = Guid.NewGuid();
        var reclaimed = await _repository.GetTrack<TelegramProcessedUpdate>()
            .Where(u => u.UpdateId == updateId
                && u.AttemptCount < _maxAttempts
                && (u.Status == TelegramProcessedUpdateStatus.Failed
                    || (u.Status == TelegramProcessedUpdateStatus.Processing && u.ClaimedAt < leaseCutoff)))
            .ExecuteUpdateAsync(s => s
                .SetProperty(u => u.Status, TelegramProcessedUpdateStatus.Processing)
                .SetProperty(u => u.ClaimedAt, now)
                .SetProperty(u => u.ProcessedAt, (DateTime?)null)
                .SetProperty(u => u.ClaimToken, reclaimToken)
                .SetProperty(u => u.AttemptCount, u => u.AttemptCount + 1), cancellationToken);

        return reclaimed > 0
            ? new TelegramUpdateClaimResult(TelegramUpdateClaimOutcome.Claimed, existing.AttemptCount + 1, reclaimToken)
            : new TelegramUpdateClaimResult(TelegramUpdateClaimOutcome.AlreadyProcessing, existing.AttemptCount);
    }

    public async Task<bool> MarkDoneAsync(long updateId, Guid claimToken, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var affected = await _repository.GetTrack<TelegramProcessedUpdate>()
            .Where(u => u.UpdateId == updateId
                && u.ClaimToken == claimToken
                && u.Status == TelegramProcessedUpdateStatus.Processing)
            .ExecuteUpdateAsync(s => s
                .SetProperty(u => u.Status, TelegramProcessedUpdateStatus.Done)
                .SetProperty(u => u.ProcessedAt, (DateTime?)now), cancellationToken);
        return affected > 0;
    }

    public async Task<bool> MarkFailedAsync(long updateId, Guid claimToken, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var affected = await _repository.GetTrack<TelegramProcessedUpdate>()
            .Where(u => u.UpdateId == updateId
                && u.ClaimToken == claimToken
                && u.Status == TelegramProcessedUpdateStatus.Processing)
            .ExecuteUpdateAsync(s => s
                .SetProperty(u => u.Status, TelegramProcessedUpdateStatus.Failed)
                .SetProperty(u => u.ProcessedAt, (DateTime?)now), cancellationToken);
        return affected > 0;
    }

    public async Task<int> PurgeAsync(DateTime processedBefore, CancellationToken cancellationToken = default)
    {
        return await _repository.GetTrack<TelegramProcessedUpdate>()
            .Where(u => (u.ProcessedAt != null && u.ProcessedAt < processedBefore)
                || (u.Status == TelegramProcessedUpdateStatus.Processing && u.ClaimedAt < processedBefore))
            .ExecuteDeleteAsync(cancellationToken);
    }
}
