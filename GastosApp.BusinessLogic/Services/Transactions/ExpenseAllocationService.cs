using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class ExpenseAllocationService : IExpenseAllocationService
    {
        private readonly IRepository _repository;
        private readonly IBillablePartyService _billablePartyService;

        public ExpenseAllocationService(IRepository repository, IBillablePartyService billablePartyService)
        {
            _repository = repository;
            _billablePartyService = billablePartyService;
        }

        // Cota anti-abuso: el número real de responsables por usuario es pequeño; 50 deja margen de sobra
        // sin permitir que un cliente envíe una lista arbitrariamente grande.
        private const int MaxAllocationsPerTransaction = 50;

        public async Task<(bool Success, string? ErrorMessage)> ReplaceExpenseAllocationsAsync(int transactionId, int userId, IEnumerable<ExpenseAllocationInput>? allocations, bool fallbackToSelfWhenEmpty = true)
        {
            var transaction = await _repository.Get<Transaction>(t => t.TransactionId == transactionId)
                .Select(t => new { t.Type, t.Amount, UserId = t.Account.UserId })
                .FirstOrDefaultAsync();
            if (transaction == null || transaction.UserId != userId) return (false, "Transaction not found");
            if (!string.Equals(transaction.Type, TransactionDomainConstants.TransactionType.Expense, StringComparison.OrdinalIgnoreCase)) return (true, null);

            var requestedInputs = (allocations ?? []).ToList();
            if (requestedInputs.Count > MaxAllocationsPerTransaction)
                return (false, $"Too many allocations: maximum {MaxAllocationsPerTransaction} allowed");

            var normalizedInputs = requestedInputs
                .Where(a => a != null && a.BillablePartyId > 0 && a.Value > 0)
                .Select(a => new ExpenseAllocationInput
                {
                    BillablePartyId = a.BillablePartyId,
                    Type = (a.Type ?? string.Empty).Trim().ToLowerInvariant(),
                    Value = a.Value
                })
                .ToList();

            if (normalizedInputs.Count == 0)
            {
                if (!fallbackToSelfWhenEmpty) return (true, null);
                var selfParty = await _billablePartyService.EnsureSelfPartyAsync(userId);
                normalizedInputs = [new ExpenseAllocationInput { BillablePartyId = selfParty.BillablePartyId, Type = TransactionDomainConstants.AllocationMode.Percentage, Value = 100m }];
            }

            var duplicateBillablePartyId = normalizedInputs.GroupBy(a => a.BillablePartyId).Where(g => g.Count() > 1).Select(g => (int?)g.Key).FirstOrDefault();
            if (duplicateBillablePartyId.HasValue) return (false, $"Duplicate billable party in allocation: {duplicateBillablePartyId.Value}");

            var billablePartyIds = normalizedInputs.Select(a => a.BillablePartyId).Distinct().ToList();
            var billableParties = await _repository.Get<BillableParty>(p => billablePartyIds.Contains(p.BillablePartyId) && p.OwnerUserId == userId && p.Active).ToListAsync();
            if (billableParties.Count != billablePartyIds.Count) return (false, "One or more billable parties are invalid for this user");

            var hasPercentage = normalizedInputs.Any(a => a.Type == TransactionDomainConstants.AllocationMode.Percentage);
            var hasAmount = normalizedInputs.Any(a => a.Type == TransactionDomainConstants.AllocationMode.Amount);
            if (hasPercentage && hasAmount) return (false, "Allocations cannot mix percentage and amount modes");
            if (!hasPercentage && !hasAmount) return (false, "Allocation type must be percentage or amount");

            var allocationBasis = normalizedInputs.Sum(a => a.Value);
            if (hasPercentage && Math.Abs(allocationBasis - 100m) > 0.0001m) return (false, "Percentage allocations must sum exactly 100");
            if (hasAmount && Math.Abs(allocationBasis - transaction.Amount) > 0.01m) return (false, "Amount allocations must sum exactly transaction amount");

            if (transaction.Amount <= 0) return (false, "Transaction amount must be greater than zero");

            var computedAmounts = DistributeCentsExact(transaction.Amount, normalizedInputs.Select(a => a.Value).ToList());

            var existing = await _repository.Get<TransactionAllocation>(a => a.TransactionId == transactionId).ToListAsync();
            if (existing.Count > 0)
            {
                _repository.GetTrack<TransactionAllocation>().RemoveRange(existing);
            }

            var newAllocations = new List<TransactionAllocation>();
            for (var i = 0; i < normalizedInputs.Count; i++)
            {
                var input = normalizedInputs[i];
                var party = billableParties.First(p => p.BillablePartyId == input.BillablePartyId);
                newAllocations.Add(new TransactionAllocation
                {
                    TransactionId = transactionId,
                    BillablePartyId = input.BillablePartyId,
                    AllocationMode = hasPercentage ? TransactionDomainConstants.AllocationMode.Percentage : TransactionDomainConstants.AllocationMode.Amount,
                    AllocationValue = input.Value,
                    CalculatedAmount = computedAmounts[i],
                    BillablePartySnapshotName = party.DisplayName
                });
            }

            _repository.GetTrack<TransactionAllocation>().AddRange(newAllocations);
            await _repository.SaveChangesAsync();

            return (true, null);
        }

        // Reparto determinista en céntimos por mayor residuo: suma exacta == total, nunca negativo y
        // desempate por índice de entrada. Se eligió frente a "último = total - anteriores" porque este
        // último puede quedar negativo cuando el redondeo por ítem acumula de más (p. ej. 20 × 5% de 0.10).
        private static List<decimal> DistributeCentsExact(decimal total, IReadOnlyList<decimal> weights)
        {
            var result = new List<decimal>(weights.Count);
            var totalCents = decimal.Round(total * 100m, 0, MidpointRounding.AwayFromZero);
            if (totalCents <= 0m || weights.Count == 0)
            {
                for (var i = 0; i < weights.Count; i++) result.Add(0m);
                return result;
            }

            var totalWeight = weights.Sum();
            var cents = new decimal[weights.Count];
            var fractions = new decimal[weights.Count];
            decimal assignedCents = 0m;
            for (var i = 0; i < weights.Count; i++)
            {
                var exactCents = weights[i] / totalWeight * totalCents;
                var floorCents = Math.Floor(exactCents);
                cents[i] = floorCents;
                fractions[i] = exactCents - floorCents;
                assignedCents += floorCents;
            }

            var remainder = (int)(totalCents - assignedCents);
            var order = Enumerable.Range(0, weights.Count)
                .OrderByDescending(i => fractions[i])
                .ThenBy(i => i)
                .ToList();
            for (var i = 0; i < remainder; i++) cents[order[i]] += 1m;

            for (var i = 0; i < weights.Count; i++) result.Add(cents[i] / 100m);
            return result;
        }
    }
}
