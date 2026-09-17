using GastosApp.BusinessLogic.Models.Transactions;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface IExpenseAllocationService
    {
        Task<(bool Success, string? ErrorMessage)> ReplaceExpenseAllocationsAsync(int transactionId, int userId, IEnumerable<ExpenseAllocationInput>? allocations, bool fallbackToSelfWhenEmpty = true);
    }
}
