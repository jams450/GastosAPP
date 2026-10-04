using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface IRepository
    {
        IQueryable<T> Get<T>() where T : class;
        IQueryable<T> Get<T>(Expression<Func<T, bool>> predicate) where T : class;
        DbSet<T> GetTrack<T>() where T : class;

        Task<T?> GetByIdAsync<T>(int id) where T : class;
        Task<T?> GetByIdAsync<T>(Guid id) where T : class;

        Task<T> Save<T>(T model) where T : class;
        Task<T> SaveUpdate<T>(int Id, T model) where T : class;
        Task<T> SaveUpdate<T>(Guid Id, T model) where T : class;

        Task<int> RemoveAsync<T>(T entity) where T : class;
        Task<int> RemoveAsync<T>(int id) where T : class;
        Task<int> RemoveRangeAsync<T>(List<T> entities) where T : class;

        Task<int> ExecuteSqlRawAsync(string sql, params object[] parameters);
        Task<List<T>> SqlQueryAsync<T>(string sql, params object[] parameters) where T : class;
        Task<bool> UpdateAccountBalanceAsync(int accountId, decimal delta, bool requireSufficientBalance);
        Task<List<Account>> LockAccountsAsync(IEnumerable<int> accountIds);
        Task<List<CreditInstallment>> LockCreditInstallmentsAsync(IEnumerable<int> installmentIds);
        Task<Transaction?> LockTransactionAsync(int transactionId);
        Task<List<Transaction>> LockTransferTransactionsAsync(Guid transferGroupId);
        Task<bool> ClaimBancoppelImportedRowAsync(int accountId, string fingerprint);
        Task LinkBancoppelImportedRowAsync(int accountId, string fingerprint, int transactionId);
        Task<bool> ClaimTelegramProcessedUpdateAsync(long updateId, int? telegramIdentityId, string status, DateTime claimedAt, Guid claimToken);
        Task<TelegramDraft?> LockTelegramDraftAsync(Guid draftId);
        Task LockTelegramIdentityAsync(int identityId);
        Task<TelegramProcessedUpdate?> LockTelegramProcessedUpdateAsync(long updateId);

        /// <summary>
        /// Lee la partida con <c>SELECT … FOR UPDATE</c> dentro de la transacción actual y la
        /// devuelve rastreada para poder mutarla. Bloquear la fila <b>antes</b> de leerla es lo que
        /// vuelve atómico un enlace que se decide con un "si <c>transaction_id</c> es nulo, escribe":
        /// dos altas concurrentes no pueden leer el mismo nulo. Mismo patrón que
        /// <see cref="LockAccountsAsync"/> y <see cref="LockTransactionAsync"/>.
        /// </summary>
        Task<BudgetItem?> LockBudgetItemAsync(int itemId, int userId);

        /// <summary>
        /// Reclama una entrega de alerta de forma atómica: inserta <c>alert_deliveries</c> con
        /// <c>ON CONFLICT (budget_id, threshold_id, period_key) DO NOTHING</c> y, solo si insertó,
        /// encola su <c>alert_outbox</c> (<c>pending</c>) en la misma sentencia. Devuelve <c>true</c>
        /// cuando este llamador ganó el candado de idempotencia (1 fila); <c>false</c> si ya existía.
        /// </summary>
        Task<bool> ClaimAlertDeliveryAsync(
            int budgetId,
            int thresholdId,
            int userId,
            string periodKey,
            decimal thresholdPercent,
            decimal budgetAmount,
            decimal spentAmount,
            decimal percentUsed,
            string payload,
            DateTimeOffset nextAttemptAt);

        /// <summary>
        /// Inserta una partida planificada con <c>ON CONFLICT (user_id, period_key, kind, name)
        /// DO NOTHING</c>. Devuelve <c>true</c> cuando esta llamada creó la fila y <c>false</c> cuando
        /// la ocurrencia ya existía; una sola sentencia atómica hace idempotente al materializador
        /// sin lectura previa (misma técnica que <see cref="ClaimAlertDeliveryAsync"/>).
        /// </summary>
        Task<bool> ClaimBudgetItemAsync(BudgetItemClaim claim);

        /// <summary>
        /// Encola un aviso de ejecución automática con <c>ON CONFLICT … DO NOTHING</c> sobre
        /// <c>(source_type, source_id, source_key)</c>: una fila por plantilla y periodo. El predicado
        /// del índice es obligatorio para inferir el índice parcial, y es lo que permite reinsertar
        /// cuando la fila anterior expiró a <c>failed</c>.
        /// </summary>
        Task<bool> ClaimRecurringItemNoticeAsync(
            int recurringItemId,
            int userId,
            string periodKey,
            string payload,
            DateTimeOffset nextAttemptAt);

        /// <summary>
        /// Reclama una alerta de partida planificada de forma atómica, en <b>una sola sentencia</b>:
        /// el CTE inserta <c>budget_item_alert_deliveries</c> con <c>ON CONFLICT (item_id,
        /// alert_kind, period_key) DO NOTHING</c> (primera barrera, plan §3.3) y, solo si ese
        /// INSERT devolvió fila, encola el <c>alert_outbox</c> con
        /// <c>source_type='budget_item'</c> y <c>source_key = {period_key}:{alert_kind}</c>
        /// (segunda barrera, <c>uq_alert_outbox_source</c>, plan §3.4). Devuelve <c>true</c> solo
        /// cuando este llamador ganó el candado <b>y</b> encoló el aviso (1 fila); <c>false</c> si
        /// la entrega ya existía o si la clave del outbox seguía ocupada.
        /// </summary>
        /// <remarks>
        /// Sin lectura previa ni transacción explícita: una sentencia es atómica en PostgreSQL, que
        /// es exactamente la técnica de <see cref="ClaimRecurringItemNoticeAsync"/> y
        /// <see cref="ClaimAlertDeliveryAsync"/>. El evaluador no escribe nunca sobre
        /// <c>budget_items</c>: esta fila es el único rastro del aviso.
        /// </remarks>
        Task<bool> ClaimBudgetItemAlertAsync(
            int itemId,
            int userId,
            string periodKey,
            string alertKind,
            decimal plannedAmount,
            string payload,
            DateTimeOffset nextAttemptAt);

        /// <summary>
        /// Toma un advisory lock de PostgreSQL por <paramref name="chatId"/> dentro de la transacción
        /// actual: serializa la creación de borradores del mismo chat. Se libera al commit/rollback.
        /// </summary>
        Task LockTelegramDraftChatAsync(long chatId);
        Task<int> SaveChangesAsync();
        Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> operation);
        Task<T> ExecuteTelegramConfirmationAsync<T>(Func<Task<T>> operation);

        /// <summary>
        /// <c>true</c> mientras haya una transacción SQL abierta en el contexto actual, incluida la
        /// que <see cref="ExecuteInTransactionAsync{T}"/> reusa cuando otra ya está en curso. Lo
        /// consultan los servicios cuyo trabajo debe ocurrir <b>después</b> del commit: escribir
        /// ahí convertiría un fallo propio en un rollback del trabajo de quien abrió la transacción.
        /// </summary>
        bool IsInTransaction { get; }
    }
}
