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

        public async Task<IReadOnlyList<CreditCycle>> ResolveDueCyclesAsync(Account account, DateTime purchaseDate, int installmentCount)
        {
            ValidateAccount(account);
            if (installmentCount <= 0) throw new ArgumentOutOfRangeException(nameof(installmentCount));

            var purchaseUtcDate = NormalizeToUtcDate(purchaseDate);
            var firstCycleMonth = purchaseUtcDate.Day <= account.DueDay!.Value
                ? new DateTime(purchaseUtcDate.Year, purchaseUtcDate.Month, 1, 0, 0, 0, DateTimeKind.Utc)
                : new DateTime(purchaseUtcDate.Year, purchaseUtcDate.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);

            var cycleMonths = new List<DateTime>(installmentCount);
            for (var installmentIndex = 0; installmentIndex < installmentCount; installmentIndex++)
            {
                cycleMonths.Add(firstCycleMonth.AddMonths(installmentIndex));
            }

            return await GetOrCreateCyclesAsync(account, cycleMonths);
        }

        /// <summary>
        /// Resuelve los ciclos de una cuenta para los meses indicados con una sola lectura y, si faltan,
        /// una sola escritura. Tolerante a carrera por el índice único (account_id, cutoff_at): reintenta
        /// una vez releyendo lo que otro llamador confirmó.
        /// </summary>
        private async Task<IReadOnlyList<CreditCycle>> GetOrCreateCyclesAsync(Account account, IReadOnlyList<DateTime> cycleMonths)
        {
            var trackedCycles = _repository.GetTrack<CreditCycle>();
            var cutoffs = new DateTime[cycleMonths.Count];
            for (var i = 0; i < cycleMonths.Count; i++)
            {
                cutoffs[i] = CreateUtcDate(cycleMonths[i].Year, cycleMonths[i].Month, account.DueDay!.Value);
            }

            var firstCutoff = cutoffs[0];
            var lastCutoff = cutoffs[cutoffs.Length - 1];

            const int maxAttempts = 2;
            for (var attempt = 1; ; attempt++)
            {
                var resolved = new CreditCycle?[cutoffs.Length];
                var missingIndexes = new List<int>();

                var existing = await trackedCycles
                    .Where(c => c.AccountId == account.AccountId && c.CutoffAt >= firstCutoff && c.CutoffAt <= lastCutoff)
                    .ToListAsync();
                var existingByCutoff = existing.ToDictionary(c => c.CutoffAt);

                for (var i = 0; i < cutoffs.Length; i++)
                {
                    if (existingByCutoff.TryGetValue(cutoffs[i], out var found)) resolved[i] = found;
                    else missingIndexes.Add(i);
                }

                if (missingIndexes.Count == 0) return Array.ConvertAll(resolved, c => c!);

                var created = new List<CreditCycle>(missingIndexes.Count);
                foreach (var index in missingIndexes)
                {
                    created.Add(BuildCycle(account, cycleMonths[index], cutoffs[index]));
                }

                trackedCycles.AddRange(created);
                try
                {
                    await _repository.SaveChangesAsync();
                    for (var k = 0; k < missingIndexes.Count; k++) resolved[missingIndexes[k]] = created[k];
                    return Array.ConvertAll(resolved, c => c!);
                }
                catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } && attempt < maxAttempts)
                {
                    foreach (var cycle in created) trackedCycles.Entry(cycle).State = EntityState.Detached;
                }
            }
        }

        private static CreditCycle BuildCycle(Account account, DateTime cycleMonth, DateTime cutoffAt)
        {
            var previousMonth = new DateTime(cycleMonth.Year, cycleMonth.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-1);
            var previousCutoff = CreateUtcDate(previousMonth.Year, previousMonth.Month, account.DueDay!.Value);
            var dueAt = CreatePaymentDueDate(cycleMonth.Year, cycleMonth.Month, account.DueDay.Value, account.PaymentDueDay);

            return new CreditCycle
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
        }

        private static DateTime CreateUtcDate(int year, int month, int requestedDay)
        {
            var safeDay = Math.Min(Math.Max(requestedDay, 1), DateTime.DaysInMonth(year, month));
            return new DateTime(year, month, safeDay, 0, 0, 0, DateTimeKind.Utc);
        }

        private static DateTime CreatePaymentDueDate(int cutoffYear, int cutoffMonth, int cutoffDay, int? paymentDay)
        {
            var effectivePaymentDay = paymentDay ?? DateTime.DaysInMonth(cutoffYear, cutoffMonth);
            var dueMonth = effectivePaymentDay <= Math.Min(cutoffDay, DateTime.DaysInMonth(cutoffYear, cutoffMonth))
                ? new DateTime(cutoffYear, cutoffMonth, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1)
                : new DateTime(cutoffYear, cutoffMonth, 1, 0, 0, 0, DateTimeKind.Utc);

            return CreateUtcDate(dueMonth.Year, dueMonth.Month, effectivePaymentDay);
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
