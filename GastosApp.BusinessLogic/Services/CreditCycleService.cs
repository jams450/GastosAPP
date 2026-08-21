using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace GastosApp.BusinessLogic.Services
{
    public class CreditCycleService : ICreditCycleService
    {
        private readonly IRepository _repository;

        public CreditCycleService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<CreditCycle> ResolveChargeCycleAsync(Account account, DateTime purchaseDate)
        {
            ValidateAccount(account);

            var purchaseUtcDate = NormalizeToUtcDate(purchaseDate);
            var firstCycleMonth = purchaseUtcDate.Day <= account.DueDay!.Value
                ? new DateTime(purchaseUtcDate.Year, purchaseUtcDate.Month, 1, 0, 0, 0, DateTimeKind.Utc)
                : new DateTime(purchaseUtcDate.Year, purchaseUtcDate.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);

            return await GetOrCreateCycleAsync(account, firstCycleMonth.Year, firstCycleMonth.Month);
        }

        public async Task<IReadOnlyList<CreditCycle>> ResolveDueCyclesAsync(Account account, DateTime purchaseDate, int installmentCount)
        {
            ValidateAccount(account);
            if (installmentCount <= 0) throw new ArgumentOutOfRangeException(nameof(installmentCount));

            var firstCycle = await ResolveChargeCycleAsync(account, purchaseDate);
            var dueCycles = new List<CreditCycle>(installmentCount) { firstCycle };

            for (var installmentIndex = 1; installmentIndex < installmentCount; installmentIndex++)
            {
                var cycleMonth = new DateTime(firstCycle.CutoffAt.Year, firstCycle.CutoffAt.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(installmentIndex);
                dueCycles.Add(await GetOrCreateCycleAsync(account, cycleMonth.Year, cycleMonth.Month));
            }

            return dueCycles;
        }

        private async Task<CreditCycle> GetOrCreateCycleAsync(Account account, int year, int month)
        {
            var cutoffAt = CreateUtcDate(year, month, account.DueDay!.Value);
            var trackedCycles = _repository.GetTrack<CreditCycle>();
            var existing = await trackedCycles.FirstOrDefaultAsync(c => c.AccountId == account.AccountId && c.CutoffAt == cutoffAt);
            if (existing != null) return existing;

            var previousMonth = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-1);
            var previousCutoff = CreateUtcDate(previousMonth.Year, previousMonth.Month, account.DueDay.Value);
            var dueAt = CreateUtcDate(year, month, account.PaymentDueDay ?? 31);

            var cycle = new CreditCycle
            {
                AccountId = account.AccountId,
                StartAt = previousCutoff.AddDays(1),
                CutoffAt = cutoffAt,
                DueAt = dueAt,
                OpeningBalance = 0m,
                NewCharges = 0m,
                InterestsFees = 0m,
                PaymentsUntilCutoff = 0m,
                StatementBalance = 0m,
                MinimumDue = 0m,
                PaidByDueDate = 0m,
                RemainingByDueDate = 0m,
                State = "Open"
            };

            trackedCycles.Add(cycle);
            try
            {
                await _repository.SaveChangesAsync();
                return cycle;
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                trackedCycles.Entry(cycle).State = EntityState.Detached;
                return await trackedCycles.FirstAsync(c => c.AccountId == account.AccountId && c.CutoffAt == cutoffAt);
            }
        }

        private static DateTime CreateUtcDate(int year, int month, int requestedDay)
        {
            var safeDay = Math.Min(Math.Max(requestedDay, 1), DateTime.DaysInMonth(year, month));
            return new DateTime(year, month, safeDay, 0, 0, 0, DateTimeKind.Utc);
        }

        private static DateTime NormalizeToUtcDate(DateTime value)
        {
            return value.Kind switch
            {
                DateTimeKind.Utc => value.Date,
                DateTimeKind.Local => value.ToUniversalTime().Date,
                _ => DateTime.SpecifyKind(value, DateTimeKind.Utc).Date
            };
        }

        private static void ValidateAccount(Account account)
        {
            if (!account.IsCredit) throw new InvalidOperationException("Cycle resolution only applies to credit accounts");
            if (!account.DueDay.HasValue) throw new InvalidOperationException("Credit account must define DueDay");
        }
    }
}
