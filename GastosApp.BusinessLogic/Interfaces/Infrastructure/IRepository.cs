using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
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
        Task<T> AddOrUpdate<T>(T obj) where T : class;

        Task<bool> UpdateFieldAsync<T>(int id, string propertyName, object value) where T : class;
        Task<bool> UpdateFieldAsync<T, TValue>(int id, Expression<Func<T, TValue>> propertySelector, TValue value) where T : class;
        Task<int> UpdateFieldsAsync<T>(int id, Dictionary<string, object> fields) where T : class;
        Task<int> UpdateFieldsAsync<T>(T entity, Dictionary<string, object> fields) where T : class;

        Task<int> RemoveAsync<T>(T entity) where T : class;
        Task<int> RemoveAsync<T>(int id) where T : class;
        Task<int> RemoveRangeAsync<T>(List<T> entities) where T : class;

        (List<T> ToAdd, List<T> ToRemove) DiffList<T, TKey>(IEnumerable<T> original, IEnumerable<T> updated, Func<T, TKey> keySelector) where TKey : notnull;

        Task<int> ExecuteSqlRawAsync(string sql, params object[] parameters);
        Task<List<T>> SqlQueryAsync<T>(string sql, params object[] parameters) where T : class;
        Task<bool> UpdateAccountBalanceAsync(int accountId, decimal delta, bool requireSufficientBalance);
        Task<List<Account>> LockAccountsAsync(IEnumerable<int> accountIds);
        Task<List<CreditInstallment>> LockCreditInstallmentsAsync(IEnumerable<int> installmentIds);
        Task<Transaction?> LockTransactionAsync(int transactionId);
        Task<List<Transaction>> LockTransactionsAsync(IEnumerable<int> transactionIds);
        Task<List<Transaction>> LockTransferTransactionsAsync(Guid transferGroupId);
        Task<bool> ClaimBancoppelImportedRowAsync(int accountId, string fingerprint);
        Task LinkBancoppelImportedRowAsync(int accountId, string fingerprint, int transactionId);
        Task<bool> ClaimTelegramProcessedUpdateAsync(long updateId, int? telegramIdentityId, string status, DateTime claimedAt, Guid claimToken);
        Task<TelegramExpenseDraft?> LockTelegramExpenseDraftAsync(Guid draftId);

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
        /// Toma un advisory lock de PostgreSQL por <paramref name="chatId"/> dentro de la transacción
        /// actual: serializa la creación de borradores del mismo chat. Se libera al commit/rollback.
        /// </summary>
        Task LockTelegramDraftChatAsync(long chatId);
        Task<int> SaveChangesAsync();
        Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> operation);
    }
}
