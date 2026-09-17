using GastosApp.BusinessLogic.Models.Accounts;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ITransactionQueryService
    {
        Task<Transaction?> GetByIdForUserAsync(int id, int userId);
        Task<HashSet<int>> GetExistingTransactionIdsAsync(int userId, IReadOnlyCollection<int> ids);
        Task<IEnumerable<Transaction>> GetAllByAccountIdForUserAsync(int accountId, int userId);
        Task<IEnumerable<Transaction>> GetByDateRangeForUserAsync(int accountId, int userId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Transaction>> GetByMonthForUserAsync(int accountId, int userId, string? month);
        Task<IEnumerable<Transaction>> GetByCategoryForUserAsync(int categoryId, int userId);
        Task<PagedTransactions> QueryByAccountForUserAsync(int accountId, int userId, TransactionQuery query);
        Task<TransactionAggregateResult> QueryAcrossAccountsForUserAsync(int userId, TransactionAggregateQuery query);
        Task<decimal> CalculateAccountBalanceAsync(int accountId, int userId);
        Task<AccountAnnualSummary?> GetAccountAnnualSummaryAsync(int accountId, int userId, int? year);
        Task<IEnumerable<CreditInstallmentOpenItem>> GetOpenCreditInstallmentsAsync(int creditAccountId, int userId);
        Task<IEnumerable<CreditChargeSummaryItem>> GetCreditChargeSummariesAsync(IEnumerable<int> sourceTransactionIds, int userId);
    }
}
