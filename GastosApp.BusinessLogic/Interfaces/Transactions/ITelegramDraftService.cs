using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces;

/// <summary>
/// Borradores de gasto conversacional. Persistencia "privada": nunca recibe <c>userId</c>;
/// el usuario se deriva de la <see cref="TelegramIdentity"/> referenciada por el borrador.
/// </summary>
public interface ITelegramDraftService
{
    /// <summary>
    /// Crea un borrador <c>pending</c> para el chat. Si ya existía otro pendiente en el mismo chat,
    /// lo marca <c>cancelled</c> (gana el más reciente) para respetar el único pendiente por chat.
    /// No escribe <c>transactions</c>.
    /// </summary>
    Task<TelegramDraft> CreateAsync(TelegramDraft draft, CancellationToken cancellationToken = default);

    Task<TelegramDraft?> GetAsync(Guid draftId, CancellationToken cancellationToken = default);

    Task<TelegramDraft?> GetPendingAsync(long chatId, CancellationToken cancellationToken = default);

    /// <summary>Cancela el borrador pendiente del chat. Devuelve <c>true</c> si había algo que cancelar.</summary>
    Task<bool> CancelAsync(long chatId, CancellationToken cancellationToken = default);

    /// <summary>Marca <c>expired</c> los borradores pendientes con TTL vencido. Devuelve cuántos afectó.</summary>
    Task<int> ExpireStaleAsync(DateTime utcNow, CancellationToken cancellationToken = default);

    /// <summary>Elimina borradores ya resueltos (no pendientes) con TTL anterior al corte.</summary>
    Task<int> PurgeAsync(DateTime expiresBefore, CancellationToken cancellationToken = default);

    /// <summary>
    /// Confirma un borrador dentro de una única transacción de base de datos:
    /// bloquea la fila (<c>FOR UPDATE</c>), delega la escritura real en
    /// <paramref name="createExpense"/> (que debe llamar a <c>ITransactionService</c>)
    /// y marca el borrador <c>confirmed</c> con el <c>transaction_id</c> resultante.
    /// Si <paramref name="createExpense"/> falla, todo se revierte y el borrador queda <c>pending</c>.
    /// </summary>
    Task<TelegramDraftConfirmationResult> ConfirmAsync(
        Guid draftId,
        long chatId,
        Func<TelegramDraft, Task<Transaction>> createExpense,
        CancellationToken cancellationToken = default);
}

public enum TelegramDraftConfirmationOutcome
{
    Confirmed,

    /// <summary>No existe o no pertenece al chat: no se filtra si el borrador es de otro chat.</summary>
    NotFound,

    /// <summary>El borrador existe pero ya fue confirmado/cancelado o expirado.</summary>
    NotPending,

    /// <summary>El TTL venció: se marcó <c>expired</c> y no se escribió.</summary>
    Expired
}

public sealed record TelegramDraftConfirmationResult(
    TelegramDraftConfirmationOutcome Outcome,
    TelegramDraft? Draft,
    Transaction? Transaction);
