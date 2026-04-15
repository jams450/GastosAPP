using GastosApp.BusinessLogic.Models.DataBase;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ITransactionService
    {
        Task<Transaction?> GetByIdAsync(int id);
        Task<IEnumerable<Transaction>> GetAllByAccountIdAsync(int accountId);
        Task<IEnumerable<Transaction>> GetByDateRangeAsync(int accountId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Transaction>> GetByCategoryAsync(int categoryId);
        
        // Transacciones normales (ingreso/gasto)
        Task<Transaction> CreateIncomeAsync(Transaction transaction);
        Task<Transaction> CreateExpenseAsync(Transaction transaction);
        
        // Transferencias entre cuentas
        Task<(bool Success, string? ErrorMessage)> CreateTransferAsync(
            int sourceAccountId, 
            int destinationAccountId, 
            decimal amount, 
            string? description = null,
            DateTime? transactionDate = null,
            int? categoryId = null,
            int? subcategoryId = null,
            int? merchantId = null,
            IEnumerable<string>? tags = null);
        
        Task<Transaction?> UpdateAsync(int id, Transaction transaction);
        Task<bool> DeleteAsync(int id);
        Task<bool> DeleteTransferAsync(Guid transferGroupId);
        Task<(bool Success, string? ErrorMessage)> UpdateTransferMetadataAsync(
            Guid transferGroupId,
            int userId,
            int? categoryId,
            int? subcategoryId,
            int? merchantId,
            string? description,
            DateTime? transactionDate,
            IEnumerable<string>? tags);
        
        // Recalcular saldo de cuenta basado en transacciones
        Task<decimal> CalculateAccountBalanceAsync(int accountId);
        Task<(bool IsValid, string? ErrorMessage)> ValidateAnalyticsDimensionsAsync(int userId, int? categoryId, int? subcategoryId, int? merchantId);
        Task SyncTransactionTagsAsync(int transactionId, int userId, IEnumerable<string>? tagNames);
    }
}
