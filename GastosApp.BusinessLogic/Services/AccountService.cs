using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
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

        public async Task<IEnumerable<Account>> GetAllByUserIdAsync(int userId)
        {
            return await _repository.Get<Account>(a => a.UserId == userId).ToListAsync();
        }

        public async Task<IEnumerable<Account>> GetAllActiveByUserIdAsync(int userId)
        {
            return await _repository.Get<Account>(a => a.UserId == userId && a.Active).ToListAsync();
        }

        public async Task<Account> CreateAsync(Account account)
        {
            var validation = await ValidateAccountAsync(account);
            if (!validation.IsValid)
            {
                throw new ArgumentException(validation.ErrorMessage);
            }

            account.Active = true;
            account.Created = DateTime.UtcNow;
            return await _repository.Save<Account>(account);
        }

        public async Task<Account?> UpdateAsync(int id, Account account)
        {
            var existing = await _repository.GetByIdAsync<Account>(id);
            if (existing == null) return null;

            var validation = await ValidateAccountAsync(account);
            if (!validation.IsValid)
            {
                throw new ArgumentException(validation.ErrorMessage);
            }

            account.AccountId = id;
            account.Updated = DateTime.UtcNow;
            return await _repository.SaveUpdate<Account>(id, account);
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var result = await _repository.DeleteModel<Account>(id);
            return result > 0;
        }

        public async Task<bool> UpdateActiveStatusAsync(int id, bool active)
        {
            return await _repository.UpdateFieldAsync<Account>(id, "Active", active);
        }

        public async Task<bool> UpdateBalanceAsync(int accountId, decimal amount)
        {
            var account = await _repository.GetByIdAsync<Account>(accountId);
            if (account == null) return false;

            account.CurrentBalance += amount;
            account.Updated = DateTime.UtcNow;
            await _repository.SaveChangesAsync();
            return true;
        }

        public async Task<bool> RecalculateBalanceAsync(int accountId)
        {
            var transactions = await _repository.Get<Transaction>(t => t.AccountId == accountId).ToListAsync();
            
            decimal balance = 0;
            foreach (var transaction in transactions)
            {
                switch (transaction.Type.ToLower())
                {
                    case "income":
                        balance += transaction.Amount;
                        break;
                    case "expense":
                        balance -= transaction.Amount;
                        break;
                    case "transfer":
                        // Las transferencias se manejan en pares, una negativa (salida) y una positiva (entrada)
                        // Solo sumamos si es entrada (amount positivo en cuenta destino)
                        // o restamos si es salida (amount positivo pero tipo transfer indica salida)
                        // La lógica exacta depende de cómo se registren las transferencias
                        break;
                }
            }

            return await _repository.UpdateFieldAsync<Account>(accountId, "CurrentBalance", balance);
        }

        public Task<(bool IsValid, string? ErrorMessage)> ValidateAccountAsync(Account account)
        {
            if (account.IsCredit && !account.DueDay.HasValue)
            {
                return Task.FromResult<(bool, string?)>((false, "DueDay is required when IsCredit is true"));
            }

            if (account.EarnsInterest && account.AnnualInterestRate <= 0)
            {
                return Task.FromResult<(bool, string?)>((false, "AnnualInterestRate must be greater than 0 when EarnsInterest is true"));
            }

            return Task.FromResult<(bool, string?)>((true, null));
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
                periodEnd = new DateTime(referenceDate.Year, referenceDate.Month, dueDay);
                // El inicio es el día después del corte del mes pasado
                periodStart = periodEnd.AddMonths(-1).AddDays(1);
            }
            else
            {
                // El corte fue el mes pasado
                periodEnd = new DateTime(referenceDate.Year, referenceDate.Month, dueDay).AddMonths(-1);
                // El inicio es el día después del corte de hace 2 meses
                periodStart = periodEnd.AddMonths(-1).AddDays(1);
            }

            // Obtener todas las transacciones de gasto del período
            var transactions = await _repository.Get<Transaction>(t => 
                t.AccountId == accountId &&
                t.Type.ToLower() == "expense" &&
                t.TransactionDate >= periodStart &&
                t.TransactionDate <= periodEnd).ToListAsync();

            decimal totalExpenses = transactions.Sum(t => t.Amount);

            return (totalExpenses, periodStart, periodEnd);
        }
    }
}
