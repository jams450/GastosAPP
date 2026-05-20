using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class TransactionQueryService : ITransactionQueryService
    {
        private readonly IRepository _repository;

        public TransactionQueryService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<Transaction?> GetByIdAsync(int id)
        {
            return await BuildBaseQuery(t => t.TransactionId == id)
                .FirstOrDefaultAsync();
        }

        public async Task<Transaction?> GetByIdForUserAsync(int id, int userId)
        {
            return await BuildBaseQuery(t => t.TransactionId == id && t.Account.UserId == userId)
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Transaction>> GetAllByAccountIdAsync(int accountId)
        {
            return await BuildBaseQuery(t => t.AccountId == accountId)
                .OrderByDescending(t => t.TransactionDate)
                .ToListAsync();
        }

        public async Task<IEnumerable<Transaction>> GetAllByAccountIdForUserAsync(int accountId, int userId)
        {
            return await BuildBaseQuery(t => t.AccountId == accountId && t.Account.UserId == userId)
                .OrderByDescending(t => t.TransactionDate)
                .ToListAsync();
        }

        public async Task<IEnumerable<Transaction>> GetByDateRangeAsync(int accountId, DateTime startDate, DateTime endDate)
        {
            return await BuildBaseQuery(t => t.AccountId == accountId && t.TransactionDate >= startDate && t.TransactionDate <= endDate)
                .OrderByDescending(t => t.TransactionDate)
                .ToListAsync();
        }

        public async Task<IEnumerable<Transaction>> GetByDateRangeForUserAsync(int accountId, int userId, DateTime startDate, DateTime endDate)
        {
            return await BuildBaseQuery(t => t.AccountId == accountId && t.Account.UserId == userId && t.TransactionDate >= startDate && t.TransactionDate <= endDate)
                .OrderByDescending(t => t.TransactionDate)
                .ToListAsync();
        }

        public async Task<IEnumerable<Transaction>> GetByCategoryAsync(int categoryId)
        {
            return await BuildBaseQuery(t => t.CategoryId == categoryId)
                .OrderByDescending(t => t.TransactionDate)
                .ToListAsync();
        }

        public async Task<IEnumerable<Transaction>> GetByCategoryForUserAsync(int categoryId, int userId)
        {
            return await BuildBaseQuery(t => t.CategoryId == categoryId && t.Account.UserId == userId)
                .OrderByDescending(t => t.TransactionDate)
                .ToListAsync();
        }

        public async Task<decimal> CalculateAccountBalanceAsync(int accountId)
        {
            return await _repository.Get<Transaction>(t => t.AccountId == accountId).SumAsync(t => t.BalanceImpact);
        }

        public async Task<IEnumerable<CreditInstallmentOpenItem>> GetOpenCreditInstallmentsAsync(int creditAccountId)
        {
            var rows = await _repository.Get<CreditInstallment>()
                .Include(i => i.Plan)
                .ThenInclude(p => p.SourceCharge)
                .ThenInclude(c => c.SourceTransaction)
                .Where(i => i.Plan.AccountId == creditAccountId && i.Status != TransactionDomainConstants.CreditStatus.Paid)
                .OrderBy(i => i.DueDate)
                .ToListAsync();

            if (rows.Count == 0) return [];

            var installmentIds = rows.Select(i => i.InstallmentId).ToList();
            var paidRows = await _repository.Get<InstallmentAllocation>(a => installmentIds.Contains(a.InstallmentId))
                .GroupBy(a => a.InstallmentId)
                .Select(g => new { InstallmentId = g.Key, Paid = g.Sum(x => x.AllocatedAmount) })
                .ToListAsync();
            var paidByInstallment = paidRows.ToDictionary(x => x.InstallmentId, x => x.Paid);

            return rows.Select(row =>
            {
                var paid = paidByInstallment.TryGetValue(row.InstallmentId, out var value) ? value : 0m;
                return new CreditInstallmentOpenItem
                {
                    InstallmentId = row.InstallmentId,
                    PlanId = row.PlanId,
                    PlanType = row.Plan.PlanType,
                    InstallmentNumber = row.InstallmentNumber,
                    Months = row.Plan.Months,
                    DueDate = row.DueDate,
                    TotalDue = row.TotalDue,
                    PaidAmount = paid,
                    RemainingAmount = Math.Max(row.TotalDue - paid, 0m),
                    SourceTransactionId = row.Plan.SourceCharge.SourceTransactionId,
                    Description = row.Plan.SourceCharge.SourceTransaction.Description ?? string.Empty
                };
            }).Where(x => x.RemainingAmount > 0).ToList();
        }

        public async Task<IEnumerable<CreditChargeSummaryItem>> GetCreditChargeSummariesAsync(IEnumerable<int> sourceTransactionIds)
        {
            var ids = sourceTransactionIds.Distinct().ToList();
            if (ids.Count == 0) return [];

            var plans = await _repository.Get<CreditInstallmentPlan>()
                .Include(p => p.SourceCharge)
                .Include(p => p.Installments)
                .Where(p => ids.Contains(p.SourceCharge.SourceTransactionId))
                .ToListAsync();

            if (plans.Count == 0) return [];

            var installmentIds = plans.SelectMany(p => p.Installments).Select(i => i.InstallmentId).Distinct().ToList();
            var paidByInstallment = installmentIds.Count == 0
                ? new Dictionary<int, decimal>()
                : await _repository.Get<InstallmentAllocation>(a => installmentIds.Contains(a.InstallmentId))
                    .GroupBy(a => a.InstallmentId)
                    .Select(g => new { InstallmentId = g.Key, Paid = g.Sum(x => x.AllocatedAmount) })
                    .ToDictionaryAsync(x => x.InstallmentId, x => x.Paid);

            return plans.Select(plan =>
            {
                var totalDue = plan.Installments.Sum(i => i.TotalDue);
                var paidTotal = plan.Installments.Sum(i => paidByInstallment.TryGetValue(i.InstallmentId, out var value) ? value : 0m);
                return new CreditChargeSummaryItem
                {
                    SourceTransactionId = plan.SourceCharge.SourceTransactionId,
                    Months = Math.Max(plan.Months, 1),
                    RemainingAmount = Math.Max(totalDue - paidTotal, 0m),
                    Status = plan.SourceCharge.Status
                };
            }).ToList();
        }

        private IQueryable<Transaction> BuildBaseQuery(System.Linq.Expressions.Expression<Func<Transaction, bool>> predicate)
        {
            return _repository.Get<Transaction>(predicate)
                .Include(t => t.TransactionTags)
                .ThenInclude(tt => tt.Tag)
                .Include(t => t.TransactionAllocations)
                .ThenInclude(a => a.BillableParty);
        }
    }
}
