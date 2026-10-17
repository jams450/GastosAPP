using GastosApp.BusinessLogic.Models.Accounts;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface IAccountService
    {
        Task<Account?> GetByIdAsync(int id);
        Task<Account?> GetByIdForUserAsync(int id, int userId);
        Task<IEnumerable<Account>> GetAllByUserIdAsync(int userId);
        Task<IEnumerable<Account>> GetAllActiveByUserIdAsync(int userId);

        /// <summary>
        /// Snapshot canónico de crédito (deuda normal/MSI, total y disponible) por cuenta de crédito
        /// propia, incluidas las inactivas. Sólo lectura; no recalcula balances ni escribe.
        /// </summary>
        Task<IReadOnlyDictionary<int, AccountCreditSnapshot>> GetCreditSnapshotsAsync(int userId, IEnumerable<Account> ownedAccounts);
        Task<Account> CreateAsync(Account account, int userId);
        Task<Account?> UpdateForUserAsync(int id, int userId, Account account);
        Task<bool> DeleteForUserAsync(int id, int userId);
        Task<bool> UpdateActiveStatusForUserAsync(int id, int userId, bool active);
        Task<bool> RecalculateBalanceAsync(int accountId, int userId);
        Task<(decimal TotalExpenses, DateTime PeriodStart, DateTime PeriodEnd)> GetCreditCardExpensesForPeriodAsync(int accountId, int userId, DateTime referenceDate);
    }
}
