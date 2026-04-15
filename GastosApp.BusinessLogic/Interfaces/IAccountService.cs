using GastosApp.BusinessLogic.Models.DataBase;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface IAccountService
    {
        Task<Account?> GetByIdAsync(int id);
        Task<IEnumerable<Account>> GetAllByUserIdAsync(int userId);
        Task<IEnumerable<Account>> GetAllActiveByUserIdAsync(int userId);
        Task<Account> CreateAsync(Account account);
        Task<Account?> UpdateAsync(int id, Account account);
        Task<bool> DeleteAsync(int id);
        Task<bool> UpdateActiveStatusAsync(int id, bool active);
        Task<bool> UpdateBalanceAsync(int accountId, decimal amount);
        Task<bool> RecalculateBalanceAsync(int accountId);
        Task<(bool IsValid, string? ErrorMessage)> ValidateAccountAsync(Account account);
        Task<(decimal TotalExpenses, DateTime PeriodStart, DateTime PeriodEnd)> GetCreditCardExpensesForPeriodAsync(int accountId, DateTime referenceDate);
    }
}
