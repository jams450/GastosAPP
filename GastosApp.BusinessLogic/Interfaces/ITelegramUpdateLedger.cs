using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces;

public interface ITelegramUpdateLedger
{
    /// <summary>
    /// Reclama el update de forma atómica (<c>INSERT ... ON CONFLICT DO NOTHING</c>).
    /// Permite reclaim si el lease expiró o el intento anterior quedó en <c>failed</c>,
    /// siempre que <c>attempt_count</c> no haya alcanzado el máximo.
    /// El resultado <see cref="TelegramUpdateClaimResult.ClaimToken"/> es el token del lease
    /// y debe reenviarse a <see cref="MarkDoneAsync"/> / <see cref="MarkFailedAsync"/>.
    /// </summary>
    Task<TelegramUpdateClaimResult> ClaimAsync(long updateId, int? telegramIdentityId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Cierra el lease como <c>done</c> solo si <paramref name="claimToken"/> sigue siendo el
    /// dueño (update condicional). Devuelve <c>false</c> si el lease expiró y otro worker lo
    /// reclamó: en ese caso no se debe pisar el estado del update ajeno.
    /// </summary>
    Task<bool> MarkDoneAsync(long updateId, Guid claimToken, CancellationToken cancellationToken = default);

    /// <summary>
    /// Cierra el lease como <c>failed</c> solo si <paramref name="claimToken"/> sigue siendo el
    /// dueño (update condicional). Devuelve <c>false</c> si el lease fue reclamado por otro worker.
    /// </summary>
    Task<bool> MarkFailedAsync(long updateId, Guid claimToken, CancellationToken cancellationToken = default);

    /// <summary>Elimina filas ya terminadas anteriores a <paramref name="processedBefore"/> (retención).</summary>
    Task<int> PurgeAsync(DateTime processedBefore, CancellationToken cancellationToken = default);
}

public enum TelegramUpdateClaimOutcome
{
    /// <summary>El update se procesó por primera vez, se recuperó el lease o se reintenta tras <c>failed</c>.</summary>
    Claimed,

    /// <summary>El update ya se completó (<c>done</c>): reintento de Telegram, sin efecto.</summary>
    Duplicate,

    /// <summary>Otro proceso mantiene un lease vigente: no se ejecuta.</summary>
    AlreadyProcessing,

    /// <summary>Se agotaron los intentos permitidos.</summary>
    Exhausted
}

public sealed record TelegramUpdateClaimResult(
    TelegramUpdateClaimOutcome Outcome,
    int AttemptCount,
    /// <summary>Token del lease vigente; solo no nulo cuando <see cref="Outcome"/> es <c>Claimed</c>.</summary>
    Guid? ClaimToken = null);
