using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class AccountService : IAccountService
    {
        private readonly IRepository _repository;

        public AccountService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<Account?> GetByIdAsync(int id)
        {
            return await _repository.GetByIdAsync<Account>(id);
        }

        public async Task<Account?> GetByIdForUserAsync(int id, int userId)
        {
            return await _repository.Get<Account>(a => a.AccountId == id && a.UserId == userId)
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Account>> GetAllByUserIdAsync(int userId)
        {
            return await _repository.Get<Account>(a => a.UserId == userId)
                .OrderBy(a => a.Name)
                .ThenBy(a => a.AccountId)
                .ToListAsync();
        }

        public async Task<IEnumerable<Account>> GetAllActiveByUserIdAsync(int userId)
        {
            return await _repository.Get<Account>(a => a.UserId == userId && a.Active)
                .OrderBy(a => a.Name)
                .ThenBy(a => a.AccountId)
                .ToListAsync();
        }

        public async Task<Account> CreateAsync(Account account)
        {
            var validation = ValidateAccount(account);
            if (!validation.IsValid)
            {
                throw new ArgumentException(validation.ErrorMessage);
            }

            account.Active = true;
            return await _repository.Save<Account>(account);
        }

        public async Task<Account?> UpdateAsync(int id, Account account)
        {
            var existing = await _repository.GetByIdAsync<Account>(id);
            if (existing == null) return null;

            var validation = ValidateAccount(account);
            if (!validation.IsValid)
            {
                throw new ArgumentException(validation.ErrorMessage);
            }

            account.AccountId = id;
            return await _repository.SaveUpdate<Account>(id, account);
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var result = await _repository.RemoveAsync<Account>(id);
            return result > 0;
        }

        public async Task<bool> UpdateActiveStatusAsync(int id, bool active)
        {
            return await _repository.UpdateFieldAsync<Account, bool>(id, a => a.Active, active);
        }

        public async Task<bool> RecalculateBalanceAsync(int accountId)
        {
            var balance = await _repository.Get<Transaction>(t => t.AccountId == accountId)
                .SumAsync(t => t.BalanceImpact);

            return await _repository.UpdateFieldAsync<Account, decimal>(accountId, a => a.CurrentBalance, balance);
        }

        private static (bool IsValid, string? ErrorMessage) ValidateAccount(Account account)
        {
            if (account.DueDay.HasValue && (account.DueDay.Value < 1 || account.DueDay.Value > 31))
            {
                return (false, "DueDay must be between 1 and 31");
            }

            if (account.PaymentDueDay.HasValue && (account.PaymentDueDay.Value < 1 || account.PaymentDueDay.Value > 31))
            {
                return (false, "PaymentDueDay must be between 1 and 31");
            }

            if (account.IsCredit && !account.DueDay.HasValue)
            {
                return (false, "DueDay is required when IsCredit is true");
            }

            if (account.EarnsInterest && account.AnnualInterestRate <= 0)
            {
                return (false, "AnnualInterestRate must be greater than 0 when EarnsInterest is true");
            }

            return (true, null);
        }

        public async Task<(decimal TotalExpenses, DateTime PeriodStart, DateTime PeriodEnd)> GetCreditCardExpensesForPeriodAsync(int accountId, DateTime referenceDate)
        {
            var account = await _repository.GetByIdAsync<Account>(accountId);
            if (account == null)
                throw new ArgumentException("Account not found");

            if (!account.IsCredit)
                throw new ArgumentException("This method only works for credit accounts");

            if (!account.DueDay.HasValue)
                throw new ArgumentException("Credit account must have a due day configured");

            int dueDay = account.DueDay.Value;
            
            // Calcular el período de corte
            // El período es desde el día después del corte anterior hasta el día del corte actual
            DateTime periodEnd;
            DateTime periodStart;
            
            // Si la fecha de referencia es después del día de corte de este mes,
            // el período termina en el corte de este mes
            // Si es antes, el período termina en el corte del mes pasado
            if (referenceDate.Day >= dueDay)
            {
                // El corte es este mes
                periodEnd = CreateSafeDate(referenceDate.Year, referenceDate.Month, dueDay);
                // El inicio es el día después del corte del mes pasado
                var previousCutoff = CreateSafeDate(periodEnd.AddMonths(-1).Year, periodEnd.AddMonths(-1).Month, dueDay);
                periodStart = previousCutoff.AddDays(1);
            }
            else
            {
                // El corte fue el mes pasado
                periodEnd = CreateSafeDate(referenceDate.Year, referenceDate.Month, dueDay).AddMonths(-1);
                // El inicio es el día después del corte de hace 2 meses
                var previousCutoff = CreateSafeDate(periodEnd.AddMonths(-1).Year, periodEnd.AddMonths(-1).Month, dueDay);
                periodStart = previousCutoff.AddDays(1);
            }

            var periodEndExclusive = periodEnd.AddDays(1);

            // Obtener todas las transacciones de gasto del período
            var totalExpenses = await _repository.Get<Transaction>(t => 
                t.AccountId == accountId &&
                t.BalanceImpact < 0 &&
                t.TransactionDate >= periodStart &&
                t.TransactionDate < periodEndExclusive)
                .SumAsync(t => Math.Abs(t.BalanceImpact));

            return (totalExpenses, periodStart, periodEnd);
        }

        private static DateTime CreateSafeDate(int year, int month, int day)
        {
            var maxDay = DateTime.DaysInMonth(year, month);
            var safeDay = Math.Clamp(day, 1, maxDay);
            return new DateTime(year, month, safeDay, 0, 0, 0, DateTimeKind.Utc);
        }
    }
}
