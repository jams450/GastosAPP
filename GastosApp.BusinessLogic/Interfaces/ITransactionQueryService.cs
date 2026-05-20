using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ITransactionQueryService
    {
        Task<Transaction?> GetByIdAsync(int id);
        Task<Transaction?> GetByIdForUserAsync(int id, int userId);
        Task<IEnumerable<Transaction>> GetAllByAccountIdAsync(int accountId);
        Task<IEnumerable<Transaction>> GetAllByAccountIdForUserAsync(int accountId, int userId);
        Task<IEnumerable<Transaction>> GetByDateRangeAsync(int accountId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Transaction>> GetByDateRangeForUserAsync(int accountId, int userId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Transaction>> GetByCategoryAsync(int categoryId);
        Task<IEnumerable<Transaction>> GetByCategoryForUserAsync(int categoryId, int userId);
        Task<decimal> CalculateAccountBalanceAsync(int accountId);
        Task<IEnumerable<CreditInstallmentOpenItem>> GetOpenCreditInstallmentsAsync(int creditAccountId);
        Task<IEnumerable<CreditChargeSummaryItem>> GetCreditChargeSummariesAsync(IEnumerable<int> sourceTransactionIds);
    }
}
