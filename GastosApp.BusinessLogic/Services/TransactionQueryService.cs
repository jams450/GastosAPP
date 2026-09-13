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

        public async Task<IEnumerable<Transaction>> GetByMonthForUserAsync(int accountId, int userId, string? month)
        {
            var (_, _, monthStartUtc, nextMonthStartUtc) = MonthRangeResolver.ResolveUtcRange(month, MonthRangeResolver.DefaultTimezoneId);

            return await BuildBaseQuery(t => t.AccountId == accountId && t.Account.UserId == userId &&
                    t.TransactionDate >= monthStartUtc && t.TransactionDate < nextMonthStartUtc)
                .OrderByDescending(t => t.TransactionDate)
                .ToListAsync();
        }

        public async Task<PagedTransactions> QueryByAccountForUserAsync(int accountId, int userId, TransactionQuery query)
        {
            var transactions = BuildBaseQuery(t => t.AccountId == accountId && t.Account.UserId == userId);

            if (query.StartDate.HasValue) transactions = transactions.Where(t => t.TransactionDate >= query.StartDate.Value);
            if (query.EndDate.HasValue) transactions = transactions.Where(t => t.TransactionDate <= query.EndDate.Value);
            if (query.CategoryId.HasValue) transactions = transactions.Where(t => t.CategoryId == query.CategoryId.Value);
            if (query.SubcategoryId.HasValue) transactions = transactions.Where(t => t.SubcategoryId == query.SubcategoryId.Value);
            if (query.MerchantId.HasValue) transactions = transactions.Where(t => t.MerchantId == query.MerchantId.Value);
            if (!string.IsNullOrWhiteSpace(query.Type)) transactions = transactions.Where(t => t.Type == query.Type);

            var totalCount = await transactions.CountAsync();
            var skip = ((long)query.Page - 1) * query.PageSize;
            var items = await transactions
                .OrderByDescending(t => t.TransactionDate)
                .ThenByDescending(t => t.TransactionId)
                .Skip(checked((int)skip))
                .Take(query.PageSize)
                .AsSplitQuery()
                .ToListAsync();

            return new PagedTransactions { TotalCount = totalCount, Items = items };
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

        public async Task<TransactionAggregateResult> QueryAcrossAccountsForUserAsync(int userId, TransactionAggregateQuery query)
        {
            var timezone = MonthRangeResolver.ResolveTimeZone(MonthRangeResolver.DefaultTimezoneId);
            var startLocal = DateTime.SpecifyKind(query.Desde.Date, DateTimeKind.Unspecified);
            var endLocal = DateTime.SpecifyKind(query.Hasta.Date.AddDays(1), DateTimeKind.Unspecified);
            var startUtc = TimeZoneInfo.ConvertTimeToUtc(startLocal, timezone);
            var endUtc = TimeZoneInfo.ConvertTimeToUtc(endLocal, timezone);
            var groupBy = query.GroupBy?.ToLowerInvariant() ?? "total";
            var limit = Math.Clamp(query.Limit, 1, 50);

            var transactions = _repository.Get<Transaction>(t =>
                t.Account.UserId == userId &&
                t.TransactionDate >= startUtc &&
                t.TransactionDate < endUtc);

            if (!string.IsNullOrWhiteSpace(query.Type)) transactions = transactions.Where(t => t.Type == query.Type);
            if (query.CategoryId.HasValue) transactions = transactions.Where(t => t.CategoryId == query.CategoryId.Value);
            if (query.SubcategoryId.HasValue) transactions = transactions.Where(t => t.SubcategoryId == query.SubcategoryId.Value);
            if (query.AccountId.HasValue) transactions = transactions.Where(t => t.AccountId == query.AccountId.Value);
            if (query.MerchantId.HasValue) transactions = transactions.Where(t => t.MerchantId == query.MerchantId.Value);

            var totals = await transactions
                .GroupBy(_ => 1)
                .Select(g => new
                {
                    Expense = g.Sum(t => t.Type == TransactionDomainConstants.TransactionType.Expense ? t.Amount : 0m),
                    Income = g.Sum(t => t.Type == TransactionDomainConstants.TransactionType.Income ? t.Amount : 0m)
                })
                .FirstOrDefaultAsync();

            var result = new TransactionAggregateResult
            {
                TotalExpense = totals?.Expense ?? 0m,
                TotalIncome = totals?.Income ?? 0m,
                GroupBy = groupBy
            };

            if (groupBy == "total") return result;

            List<TransactionAggregateBucket> buckets;
            switch (groupBy)
            {
                case "categoria":
                    buckets = await transactions
                        .GroupBy(t => new { t.CategoryId, Name = t.Category != null ? t.Category.Name : "Sin categoría" })
                        .Select(g => new TransactionAggregateBucket
                        {
                            Id = g.Key.CategoryId,
                            Key = g.Key.Name,
                            Expense = g.Sum(t => t.Type == TransactionDomainConstants.TransactionType.Expense ? t.Amount : 0m),
                            Income = g.Sum(t => t.Type == TransactionDomainConstants.TransactionType.Income ? t.Amount : 0m),
                            Count = g.Count()
                        })
                        .OrderByDescending(b => b.Expense)
                        .Take(limit)
                        .ToListAsync();
                    break;
                case "subcategoria":
                    buckets = await transactions
                        .GroupBy(t => new { t.SubcategoryId, Name = t.Subcategory != null ? t.Subcategory.Name : "Sin subcategoría" })
                        .Select(g => new TransactionAggregateBucket
                        {
                            Id = g.Key.SubcategoryId,
                            Key = g.Key.Name,
                            Expense = g.Sum(t => t.Type == TransactionDomainConstants.TransactionType.Expense ? t.Amount : 0m),
                            Income = g.Sum(t => t.Type == TransactionDomainConstants.TransactionType.Income ? t.Amount : 0m),
                            Count = g.Count()
                        })
                        .OrderByDescending(b => b.Expense)
                        .Take(limit)
                        .ToListAsync();
                    break;
                case "cuenta":
                    buckets = await transactions
                        .GroupBy(t => new { t.AccountId, t.Account.Name })
                        .Select(g => new TransactionAggregateBucket
                        {
                            Id = g.Key.AccountId,
                            Key = g.Key.Name,
                            Expense = g.Sum(t => t.Type == TransactionDomainConstants.TransactionType.Expense ? t.Amount : 0m),
                            Income = g.Sum(t => t.Type == TransactionDomainConstants.TransactionType.Income ? t.Amount : 0m),
                            Count = g.Count()
                        })
                        .OrderByDescending(b => b.Expense)
                        .Take(limit)
                        .ToListAsync();
                    break;
                case "comercio":
                    buckets = await transactions
                        .GroupBy(t => new { t.MerchantId, Name = t.Merchant != null ? t.Merchant.Name : "Sin comercio" })
                        .Select(g => new TransactionAggregateBucket
                        {
                            Id = g.Key.MerchantId,
                            Key = g.Key.Name,
                            Expense = g.Sum(t => t.Type == TransactionDomainConstants.TransactionType.Expense ? t.Amount : 0m),
                            Income = g.Sum(t => t.Type == TransactionDomainConstants.TransactionType.Income ? t.Amount : 0m),
                            Count = g.Count()
                        })
                        .OrderByDescending(b => b.Expense)
                        .Take(limit)
                        .ToListAsync();
                    break;
                case "dia":
                case "mes":
                    var rows = await transactions
                        .Select(t => new TransactionAggregateRow { TransactionDate = t.TransactionDate, Type = t.Type, Amount = t.Amount })
                        .ToListAsync();
                    buckets = rows
                        .GroupBy(row => TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(row.TransactionDate, DateTimeKind.Utc), timezone)
                            .ToString(groupBy == "dia" ? "yyyy-MM-dd" : "yyyy-MM"))
                        .Select(g => new TransactionAggregateBucket
                        {
                            Key = g.Key,
                            Expense = g.Where(row => IsTransactionType(row.Type, TransactionDomainConstants.TransactionType.Expense)).Sum(row => row.Amount),
                            Income = g.Where(row => IsTransactionType(row.Type, TransactionDomainConstants.TransactionType.Income)).Sum(row => row.Amount),
                            Count = g.Count()
                        })
                        .OrderByDescending(b => b.Expense)
                        .Take(limit)
                        .ToList();
                    break;
                default:
                    throw new ArgumentException("GroupBy must be total, categoria, subcategoria, cuenta, comercio, dia, or mes.");
            }

            return new TransactionAggregateResult
            {
                TotalExpense = result.TotalExpense,
                TotalIncome = result.TotalIncome,
                GroupBy = groupBy,
                Buckets = buckets
            };
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

        private static bool IsTransactionType(string? actual, string expected)
        {
            return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
        }

        private sealed class TransactionAggregateRow
        {
            public DateTime TransactionDate { get; init; }
            public string Type { get; init; } = string.Empty;
            public decimal Amount { get; init; }
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
