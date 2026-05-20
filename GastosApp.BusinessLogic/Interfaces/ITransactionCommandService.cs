using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ITransactionCommandService
    {
        Task<Transaction> CreateIncomeAsync(Transaction transaction);
        Task<Transaction> CreateExpenseAsync(Transaction transaction, int userId, IEnumerable<ExpenseAllocationInput>? allocations = null);
        Task<Transaction?> UpdateAsync(int id, Transaction transaction);
        Task<bool> DeleteAsync(int id);
    }
}
