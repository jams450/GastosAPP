using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ITransactionCommandService
    {
        Task<Transaction> CreateIncomeAsync(Transaction transaction, int userId, IEnumerable<(int InstallmentId, decimal Amount)>? creditAllocations = null, IEnumerable<string>? tags = null);
        Task<Transaction> CreateExpenseAsync(Transaction transaction, int userId, IEnumerable<ExpenseAllocationInput>? allocations = null, IEnumerable<string>? tags = null, int? msiMonths = null);
        Task<(Transaction? Transaction, string? ErrorMessage)> UpdateTransactionWithDetailsForUserAsync(
            int id,
            int userId,
            Transaction transaction,
            IEnumerable<string>? tags,
            IEnumerable<ExpenseAllocationInput>? allocations,
            bool replaceAllocations);
        Task<bool> DeleteForUserAsync(int id, int userId);
    }
}
