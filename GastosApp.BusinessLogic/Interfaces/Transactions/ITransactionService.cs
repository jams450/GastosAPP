using GastosApp.Models.Entities;
using GastosApp.BusinessLogic.Models.Transactions;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ITransactionService
    {
        Task<Transaction?> GetByIdForUserAsync(int id, int userId);
        Task<IEnumerable<Transaction>> GetAllByAccountIdForUserAsync(int accountId, int userId);
        Task<IEnumerable<Transaction>> GetByDateRangeForUserAsync(int accountId, int userId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Transaction>> GetByMonthForUserAsync(int accountId, int userId, string? month);
        Task<IEnumerable<Transaction>> GetByCategoryForUserAsync(int categoryId, int userId);
        Task<PagedTransactions> QueryByAccountForUserAsync(int accountId, int userId, TransactionQuery query);
        
        // Transacciones normales (ingreso/gasto)
        Task<Transaction> CreateIncomeAsync(Transaction transaction, int userId, IEnumerable<(int InstallmentId, decimal Amount)>? creditAllocations = null, IEnumerable<string>? tags = null);
        Task<Transaction> CreateExpenseAsync(Transaction transaction, int userId, IEnumerable<ExpenseAllocationInput>? allocations = null, IEnumerable<string>? tags = null, int? msiMonths = null);
        
        // Transferencias entre cuentas
        Task<(bool Success, string? ErrorMessage, Guid? TransferGroupId, int? SourceTransactionId, int? DestinationTransactionId)> CreateTransferAsync(
            int userId,
            int sourceAccountId, 
            int destinationAccountId, 
            decimal amount, 
            string? description = null,
            DateTime? transactionDate = null,
            int? categoryId = null,
            int? subcategoryId = null,
            int? merchantId = null,
            IEnumerable<string>? tags = null,
            IEnumerable<(int InstallmentId, decimal Amount)>? creditAllocations = null);
        
        Task<(Transaction? Transaction, string? ErrorMessage)> UpdateTransactionWithDetailsForUserAsync(
            int id,
            int userId,
            Transaction transaction,
            IEnumerable<string>? tags,
            IEnumerable<ExpenseAllocationInput>? allocations,
            bool replaceAllocations);
        Task<bool> DeleteForUserAsync(int id, int userId);
        Task<bool> DeleteTransferAsync(Guid transferGroupId, int userId);
        Task<(bool Success, string? ErrorMessage)> UpdateTransferMetadataAsync(
            Guid transferGroupId,
            int userId,
            int? categoryId,
            int? subcategoryId,
            int? merchantId,
            string? description,
            DateTime? transactionDate,
            IEnumerable<string>? tags,
            bool clearAnalytics);
        
        // Recalcular saldo de cuenta basado en transacciones
        Task<decimal> CalculateAccountBalanceAsync(int accountId, int userId);
        Task<(bool IsValid, string? ErrorMessage)> ValidateAnalyticsDimensionsAsync(int userId, int? categoryId, int? subcategoryId, int? merchantId);
        Task SyncTransactionTagsAsync(int transactionId, int userId, IEnumerable<string>? tagNames);
        Task<(bool Success, string? ErrorMessage)> ReplaceExpenseAllocationsAsync(int transactionId, int userId, IEnumerable<ExpenseAllocationInput>? allocations, bool fallbackToSelfWhenEmpty = true);
        Task<(bool Success, string? ErrorMessage)> RegisterCreditPaymentAsync(
            int userId,
            int creditAccountId,
            int sourceTransactionId,
            DateTime paidAt,
            decimal amount,
            IEnumerable<(int InstallmentId, decimal Amount)> allocations);
        Task<(bool Success, string? ErrorMessage)> ConvertChargeToMsiAsync(int userId, int sourceTransactionId, int months);
        Task<IEnumerable<CreditInstallmentOpenItem>> GetOpenCreditInstallmentsAsync(int creditAccountId, int userId);
        Task<IEnumerable<CreditChargeSummaryItem>> GetCreditChargeSummariesAsync(IEnumerable<int> sourceTransactionIds, int userId);
        Task<(bool Success, string? ErrorMessage, int CreatedCount)> CreateOpeningCreditChargesAsync(
            int userId,
            int creditAccountId,
            IEnumerable<OpeningCreditChargeInput> items);
    }
}
