using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading.Tasks;
using GastosApp.BusinessLogic.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Reflection;
using GastosApp.BusinessLogic.Context;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Services
{
    public class Repository : IRepository
    {
        private readonly ContextSqlGastos _context;

        public Repository(ContextSqlGastos context)
        {
            _context = context;
            _context.Database.SetCommandTimeout(0);
        }

        #region Query Methods

        public IQueryable<T> Get<T>() where T : class
        {
            return _context.Set<T>().AsNoTracking();
        }

        public IQueryable<T> Get<T>(Expression<Func<T, bool>> predicate) where T : class
        {
            return _context.Set<T>().AsNoTracking().Where(predicate);
        }

        public DbSet<T> GetTrack<T>() where T : class
        {
            return _context.Set<T>();
        }

        #endregion

        #region GetById Methods

        public async Task<T?> GetByIdAsync<T>(int id) where T : class
        {
            return await FindByIdAsync<T>(id);
        }

        public async Task<T?> GetByIdAsync<T>(Guid id) where T : class
        {
            return await FindByIdAsync<T>(id);
        }

        #endregion

        #region Save and Update Methods

        public async Task<T> Save<T>(T model) where T : class
        {
            _context.Set<T>().Add(model);
            await _context.SaveChangesAsync();
            return model;
        }

        public async Task<T> SaveUpdate<T>(int id, T model) where T : class
        {
            return await SaveUpdateInternal(id, model);
        }

        public async Task<T> SaveUpdate<T>(Guid id, T model) where T : class
        {
            return await SaveUpdateInternal(id, model);
        }

        private async Task<T> SaveUpdateInternal<T>(object id, T model) where T : class
        {
            var existing = await FindByIdAsync<T>(id);
            if (existing != null)
            {
                _context.Entry(existing).CurrentValues.SetValues(model);
                await _context.SaveChangesAsync();
                return existing;
            }

            _context.Set<T>().Add(model);
            await _context.SaveChangesAsync();
            return model;
        }

        public async Task<T> AddOrUpdate<T>(T obj) where T : class
        {
            _context.Set<T>().Update(obj);
            await _context.SaveChangesAsync();
            return obj;
        }

        #endregion

        #region Dynamic Field Update Methods

        public async Task<bool> UpdateFieldAsync<T>(int id, string propertyName, object value) where T : class
        {
            var entity = await _context.Set<T>().FindAsync(id);
            if (entity == null) return false;

            var property = typeof(T).GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
            if (property == null || !property.CanWrite) return false;

            var convertedValue = Convert.ChangeType(value, property.PropertyType);
            property.SetValue(entity, convertedValue);

            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<bool> UpdateFieldAsync<T, TValue>(int id, Expression<Func<T, TValue>> propertySelector, TValue value) where T : class
        {
            var entity = await _context.Set<T>().FindAsync(id);
            if (entity == null) return false;

            if (propertySelector.Body is MemberExpression memberExpr)
            {
                var propertyName = memberExpr.Member.Name;
                var property = typeof(T).GetProperty(propertyName);
                if (property != null && property.CanWrite)
                {
                    property.SetValue(entity, value);
                    await _context.SaveChangesAsync();
                    return true;
                }
            }
            return false;
        }

        public async Task<int> UpdateFieldsAsync<T>(int id, Dictionary<string, object> fields) where T : class
        {
            var entity = await _context.Set<T>().FindAsync(id);
            if (entity == null) return 0;

            var properties = typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .ToDictionary(p => p.Name, StringComparer.OrdinalIgnoreCase);

            int updatedCount = 0;
            foreach (var field in fields)
            {
                if (properties.TryGetValue(field.Key, out var property) && property.CanWrite)
                {
                    var convertedValue = Convert.ChangeType(field.Value, property.PropertyType);
                    property.SetValue(entity, convertedValue);
                    updatedCount++;
                }
            }

            if (updatedCount > 0)
            {
                await _context.SaveChangesAsync();
            }
            return updatedCount;
        }

        public async Task<int> UpdateFieldsAsync<T>(T entity, Dictionary<string, object> fields) where T : class
        {
            var properties = typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .ToDictionary(p => p.Name, StringComparer.OrdinalIgnoreCase);

            int updatedCount = 0;
            foreach (var field in fields)
            {
                if (properties.TryGetValue(field.Key, out var property) && property.CanWrite)
                {
                    var convertedValue = Convert.ChangeType(field.Value, property.PropertyType);
                    property.SetValue(entity, convertedValue);
                    updatedCount++;
                }
            }

            if (updatedCount > 0)
            {
                await _context.SaveChangesAsync();
            }
            return updatedCount;
        }

        #endregion

        #region Delete Methods

        public async Task<int> RemoveAsync<T>(T entity) where T : class
        {
            _context.Set<T>().Remove(entity);
            return await _context.SaveChangesAsync();
        }

        public async Task<int> RemoveAsync<T>(int id) where T : class
        {
            var entity = await FindByIdAsync<T>(id);
            if (entity == null) return 0;
            _context.Set<T>().Remove(entity);
            return await _context.SaveChangesAsync();
        }

        public async Task<int> RemoveRangeAsync<T>(List<T> entities) where T : class
        {
            _context.Set<T>().RemoveRange(entities);
            return await _context.SaveChangesAsync();
        }

        #endregion

        #region Collection Sync Methods

        public (List<T> ToAdd, List<T> ToRemove) DiffList<T, TKey>(IEnumerable<T> original, IEnumerable<T> updated, Func<T, TKey> keySelector) where TKey : notnull
        {
            var oldDict = original.ToDictionary(keySelector);
            var newDict = updated.ToDictionary(keySelector);

            var addKeys = newDict.Keys.Except(oldDict.Keys);
            var removeKeys = oldDict.Keys.Except(newDict.Keys);

            var toAdd = addKeys.Select(k => newDict[k]).ToList();
            var toRemove = removeKeys.Select(k => oldDict[k]).ToList();

            return (toAdd, toRemove);
        }

        #endregion

        #region Raw SQL and Unit of Work

        public async Task<int> ExecuteSqlRawAsync(string sql, params object[] parameters)
        {
            return await _context.Database.ExecuteSqlRawAsync(sql, parameters);
        }

        public async Task<List<T>> SqlQueryAsync<T>(string sql, params object[] parameters) where T : class
        {
            return await _context.Database.SqlQueryRaw<T>(sql, parameters).ToListAsync();
        }

        public async Task<bool> UpdateAccountBalanceAsync(int accountId, decimal delta, bool requireSufficientBalance)
        {
            var affected = await _context.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE accounts
                SET current_balance = current_balance + {delta}
                WHERE account_id = {accountId}
                  AND ({!requireSufficientBalance} OR is_credit OR current_balance + {delta} >= 0)");
            return affected == 1;
        }

        public async Task<List<Account>> LockAccountsAsync(IEnumerable<int> accountIds)
        {
            var ids = accountIds.Distinct().OrderBy(id => id).ToArray();
            if (ids.Length == 0) return [];

            return await _context.Accounts
                .FromSqlInterpolated($"SELECT * FROM accounts WHERE account_id = ANY({ids}) ORDER BY account_id FOR UPDATE")
                .ToListAsync();
        }

        public async Task<List<CreditInstallment>> LockCreditInstallmentsAsync(IEnumerable<int> installmentIds)
        {
            var ids = installmentIds.Distinct().OrderBy(id => id).ToArray();
            if (ids.Length == 0) return [];

            return await _context.CreditInstallments
                .FromSqlInterpolated($"SELECT * FROM credit_installments WHERE installment_id = ANY({ids}) ORDER BY installment_id FOR UPDATE")
                .Include(i => i.Plan)
                .ToListAsync();
        }

        public async Task<Transaction?> LockTransactionAsync(int transactionId)
        {
            return await _context.Transactions
                .FromSqlInterpolated($"SELECT * FROM transactions WHERE transaction_id = {transactionId} FOR UPDATE")
                .FirstOrDefaultAsync();
        }

        public async Task<List<Transaction>> LockTransactionsAsync(IEnumerable<int> transactionIds)
        {
            var ids = transactionIds.Distinct().OrderBy(id => id).ToArray();
            if (ids.Length == 0) return [];

            return await _context.Transactions
                .FromSqlInterpolated($"SELECT * FROM transactions WHERE transaction_id = ANY({ids}) ORDER BY transaction_id FOR UPDATE")
                .ToListAsync();
        }

        public async Task<List<Transaction>> LockTransferTransactionsAsync(Guid transferGroupId)
        {
            return await _context.Transactions
                .FromSqlInterpolated($"SELECT * FROM transactions WHERE transfer_group_id = {transferGroupId} ORDER BY transaction_id FOR UPDATE")
                .ToListAsync();
        }

        public async Task<bool> ClaimBancoppelImportedRowAsync(int accountId, string fingerprint)
        {
            // Sin RETURNING: ExecuteSqlInterpolatedAsync reporta filas afectadas (1 = insertado,
            // 0 = conflicto). No se puede componer sobre Database.SqlQuery (root no componible).
            var affected = await _context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO bancoppel_imported_rows (account_id, fingerprint)
                VALUES ({accountId}, {fingerprint})
                ON CONFLICT (account_id, fingerprint) DO NOTHING
                """);
            return affected == 1;
        }

        public async Task LinkBancoppelImportedRowAsync(int accountId, string fingerprint, int transactionId)
        {
            await _context.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE bancoppel_imported_rows
                SET transaction_id = {transactionId}
                WHERE account_id = {accountId} AND fingerprint = {fingerprint}
                """);
        }

        public async Task<bool> ClaimTelegramProcessedUpdateAsync(long updateId, int? telegramIdentityId, string status, DateTime claimedAt, Guid claimToken)
        {
            // Sin RETURNING: ExecuteSqlInterpolatedAsync reporta filas afectadas (1 = reclamado,
            // 0 = ya existía). Componer .AnyAsync() sobre Database.SqlQuery lanza InvalidOperationException.
            var affected = await _context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO telegram_processed_updates (update_id, telegram_identity_id, status, attempt_count, claimed_at, claim_token)
                VALUES ({updateId}, {telegramIdentityId}, {status}, 1, {claimedAt}, {claimToken})
                ON CONFLICT (update_id) DO NOTHING
                """);
            return affected == 1;
        }

        public async Task<bool> ClaimAlertDeliveryAsync(
            int budgetId,
            int thresholdId,
            int userId,
            string periodKey,
            decimal thresholdPercent,
            decimal budgetAmount,
            decimal spentAmount,
            decimal percentUsed,
            string payload,
            DateTimeOffset nextAttemptAt)
        {
            // Una sola sentencia atómica: el CTE reclama la entrega con ON CONFLICT DO NOTHING y el
            // INSERT final encola el outbox SOLO si el CTE devolvió fila. Sin RETURNING hacia EF:
            // ExecuteSqlInterpolatedAsync reporta las filas afectadas del último INSERT (0 = ya existía).
            var affected = await _context.Database.ExecuteSqlInterpolatedAsync($"""
                WITH inserted AS (
                    INSERT INTO alert_deliveries (budget_id, threshold_id, user_id, period_key, threshold_percent, budget_amount, spent_amount, percent_used)
                    VALUES ({budgetId}, {thresholdId}, {userId}, {periodKey}, {thresholdPercent}, {budgetAmount}, {spentAmount}, {percentUsed})
                    ON CONFLICT (budget_id, threshold_id, period_key) DO NOTHING
                    RETURNING delivery_id
                )
                INSERT INTO alert_outbox (delivery_id, channel, payload, status, attempts, next_attempt_at)
                SELECT delivery_id, {AlertOutboxChannel.Telegram}, {payload}, {AlertOutboxStatus.Pending}, 0, {nextAttemptAt}
                FROM inserted
                """);
            return affected == 1;
        }

        public async Task<TelegramExpenseDraft?> LockTelegramExpenseDraftAsync(Guid draftId)
        {
            return await _context.TelegramExpenseDrafts
                .FromSqlInterpolated($"SELECT * FROM telegram_expense_drafts WHERE draft_id = {draftId} FOR UPDATE")
                .FirstOrDefaultAsync();
        }

        public async Task LockTelegramDraftChatAsync(long chatId)
        {
            // Advisory lock por transacción. El namespace es exclusivo de borradores de Telegram:
            // no hay otros usos de pg_advisory_xact_lock en la app.
            await _context.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({chatId})");
        }

        public async Task<int> SaveChangesAsync()
        {
            return await _context.SaveChangesAsync();
        }

        public async Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> operation)
        {
            if (_context.Database.CurrentTransaction != null)
            {
                return await operation();
            }

            await using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var result = await operation();
                await transaction.CommitAsync();
                return result;
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        #endregion

        #region Private Helpers

        private async Task<T?> FindByIdAsync<T>(object id) where T : class
        {
            return await _context.Set<T>().FindAsync(id);
        }

        #endregion

    }
}
