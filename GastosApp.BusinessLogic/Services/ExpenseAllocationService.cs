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

        public async Task<(bool Success, string? ErrorMessage)> ReplaceExpenseAllocationsAsync(int transactionId, int userId, IEnumerable<ExpenseAllocationInput>? allocations, bool fallbackToSelfWhenEmpty = true)
        {
            var transaction = await _repository.GetByIdAsync<Transaction>(transactionId);
            if (transaction == null) return (false, "Transaction not found");
            if (!string.Equals(transaction.Type, TransactionDomainConstants.TransactionType.Expense, StringComparison.OrdinalIgnoreCase)) return (true, null);

            var normalizedInputs = (allocations ?? [])
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

            var computedAmounts = new List<decimal>();
            if (hasPercentage)
            {
                var totalPercent = normalizedInputs.Sum(a => a.Value);
                if (Math.Abs(totalPercent - 100m) > 0.0001m) return (false, "Percentage allocations must sum exactly 100");

                decimal accumulated = 0m;
                for (var i = 0; i < normalizedInputs.Count; i++)
                {
                    var isLast = i == normalizedInputs.Count - 1;
                    var amount = isLast
                        ? Math.Round(transaction.Amount - accumulated, 2, MidpointRounding.AwayFromZero)
                        : Math.Round(transaction.Amount * (normalizedInputs[i].Value / 100m), 2, MidpointRounding.AwayFromZero);
                    computedAmounts.Add(amount);
                    accumulated += amount;
                }
            }
            else
            {
                var totalAmount = normalizedInputs.Sum(a => a.Value);
                if (Math.Abs(totalAmount - transaction.Amount) > 0.01m) return (false, "Amount allocations must sum exactly transaction amount");
                computedAmounts.AddRange(normalizedInputs.Select(a => Math.Round(a.Value, 2, MidpointRounding.AwayFromZero)));
            }

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
    }
}
