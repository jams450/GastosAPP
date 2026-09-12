using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Dashboard;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Mapster;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace GastosApp.BusinessLogic.Services
{
    public class DashboardService : IDashboardService
    {
        private const int CategoryTopLimit = 8;
        private const int SubcategoryTopLimit = 12;
        private const int AccountTopLimit = 8;
        private readonly IRepository _repository;

        public DashboardService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<DashboardOverviewResponse> GetOverviewAsync(int userId, string? month, string timezoneId = MonthRangeResolver.DefaultTimezoneId)
        {
            var (year, monthNumber, monthStart, nextMonthStart) = MonthRangeResolver.ResolveUtcRange(month, timezoneId);
            var previousMonthDate = new DateTime(year, monthNumber, 1).AddMonths(-1);
            var daysInMonth = DateTime.DaysInMonth(year, monthNumber);
            var previousDaysInMonth = DateTime.DaysInMonth(previousMonthDate.Year, previousMonthDate.Month);

            var accountRows = await QueryAccountOverviewRowsAsync(
                userId,
                monthStart,
                nextMonthStart,
                year,
                monthNumber,
                daysInMonth,
                previousMonthDate.Year,
                previousMonthDate.Month,
                previousDaysInMonth);

            var accounts = accountRows.Adapt<List<DashboardAccountOverview>>();
            var monthTransactions = await QueryMonthTransactionsAsync(userId, monthStart, nextMonthStart);
            var accountCreditTypes = await QueryUserAccountCreditTypesAsync(userId);
            var monthCreditCharges = await QueryMonthCreditChargesAsync(userId, monthStart, nextMonthStart);
            var financialSummary = CalculateFinancialSummary(monthTransactions, accountCreditTypes);

            var creditAccounts = accounts.Where(a => a.IsCredit).ToList();
            var cashAccounts = accounts.Where(a => !a.IsCredit).ToList();

            return new DashboardOverviewResponse
            {
                Month = $"{year:D4}-{monthNumber:D2}",
                Timezone = timezoneId,
                GeneralSummary = new DashboardGeneralSummary
                {
                    MonthIncome = financialSummary.CashIncome + financialSummary.CreditIncome,
                    MonthExpense = financialSummary.CashExpense + financialSummary.CreditExpense,
                    MonthFinancialNet = financialSummary.CashFinancialNet + financialSummary.CreditFinancialNet
                },
                Charts = new DashboardCharts
                {
                    ExpenseByCategory = BuildBreakdown(
                        monthTransactions
                            .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Expense))
                            .GroupBy(t => new { t.CategoryId, CategoryName = t.Category != null && !string.IsNullOrWhiteSpace(t.Category.Name) ? t.Category.Name : "Sin categoría" })
                            .Select(g => new DashboardBreakdownItem
                            {
                                Id = g.Key.CategoryId,
                                Name = g.Key.CategoryName,
                                Amount = g.Sum(t => t.Amount),
                                CashAmount = g.Where(t => !t.Account.IsCredit).Sum(t => t.Amount),
                                CreditAmount = g.Where(t => t.Account.IsCredit).Sum(t => t.Amount)
                            }),
                        CategoryTopLimit),
                    ExpenseBySubcategory = BuildBreakdown(
                        monthTransactions
                            .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Expense))
                            .GroupBy(t => new { t.SubcategoryId, SubcategoryName = t.Subcategory != null && !string.IsNullOrWhiteSpace(t.Subcategory.Name) ? t.Subcategory.Name : "Sin subcategoría" })
                            .Select(g => new DashboardBreakdownItem
                            {
                                Id = g.Key.SubcategoryId,
                                Name = g.Key.SubcategoryName,
                                Amount = g.Sum(t => t.Amount),
                                CashAmount = g.Where(t => !t.Account.IsCredit).Sum(t => t.Amount),
                                CreditAmount = g.Where(t => t.Account.IsCredit).Sum(t => t.Amount)
                            }),
                        SubcategoryTopLimit),
                    IncomeByAccount = BuildAccountBreakdown(financialSummary.IncomeByAccount, accounts),
                    ExpenseByAccount = BuildAccountBreakdown(financialSummary.ExpenseByAccount, accounts),
                    // Sin uso en la UI del dashboard (se conserva por compatibilidad).
                    TransferInByAccount = BuildBreakdown(
                        monthTransactions
                            .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) && t.BalanceImpact > 0)
                            .GroupBy(t => new { t.AccountId, t.Account.Name })
                            .Select(g => new DashboardBreakdownItem
                            {
                                Id = g.Key.AccountId,
                                Name = g.Key.Name,
                                Amount = g.Sum(t => t.BalanceImpact)
                            }),
                        AccountTopLimit),
                    // Sin uso en la UI del dashboard (se conserva por compatibilidad).
                    TransferOutByAccount = BuildBreakdown(
                        monthTransactions
                            .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) && t.BalanceImpact < 0)
                            .GroupBy(t => new { t.AccountId, t.Account.Name })
                            .Select(g => new DashboardBreakdownItem
                            {
                                Id = g.Key.AccountId,
                                Name = g.Key.Name,
                                Amount = g.Sum(t => Math.Abs(t.BalanceImpact))
                            }),
                        AccountTopLimit)
                },
                CreditSummary = new DashboardCreditSectionSummary
                {
                    TotalAvailable = creditAccounts.Sum(a => a.ClosingBalance),
                    MonthIncome = financialSummary.CreditIncome,
                    MonthExpense = financialSummary.CreditExpense,
                    MonthNet = creditAccounts.Sum(a => a.MonthNet),
                    MonthFinancialNet = financialSummary.CreditFinancialNet,
                    TransferIn = monthTransactions
                        .Where(t => t.Account.IsCredit && IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) && t.BalanceImpact > 0)
                        .Sum(t => t.BalanceImpact),
                    TransferOut = monthTransactions
                        .Where(t => t.Account.IsCredit && IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) && t.BalanceImpact < 0)
                        .Sum(t => Math.Abs(t.BalanceImpact)),
                    MonthMsiExpense = monthCreditCharges
                        .Where(c => string.Equals(c.PlanType, TransactionDomainConstants.CreditPlanType.Msi, StringComparison.OrdinalIgnoreCase))
                        .Sum(c => c.Amount),
                    MonthNormalExpense = monthCreditCharges
                        .Where(c => !string.Equals(c.PlanType, TransactionDomainConstants.CreditPlanType.Msi, StringComparison.OrdinalIgnoreCase))
                        .Sum(c => c.Amount),
                    PendingMsi = creditAccounts.Sum(a => a.MsiOutstanding),
                    PendingNormal = creditAccounts.Sum(a => a.NormalOutstanding)
                },
                CashSummary = new DashboardCashSectionSummary
                {
                    Total = cashAccounts.Sum(a => a.ClosingBalance),
                    MonthIncome = financialSummary.CashIncome,
                    MonthExpense = financialSummary.CashExpense,
                    MonthNet = cashAccounts.Sum(a => a.MonthNet),
                    MonthFinancialNet = financialSummary.CashFinancialNet
                },
                Accounts = accounts
            };
        }

        private async Task<List<DashboardAccountSqlRow>> QueryAccountOverviewRowsAsync(
            int userId,
            DateTime monthStart,
            DateTime nextMonthStart,
            int year,
            int monthNumber,
            int daysInMonth,
            int previousYear,
            int previousMonth,
            int previousDaysInMonth)
        {
            var sql = @"
                    SELECT *
                    FROM fn_dashboard_credit_overview(
                        @userId,
                        @monthStart,
                        @nextMonthStart,
                        @yearValue,
                        @monthValue,
                        @daysInMonth,
                        @previousYear,
                        @previousMonth,
                        @previousDaysInMonth
                    )
                    ORDER BY ""Name"";";

            return await _repository.SqlQueryAsync<DashboardAccountSqlRow>(
                sql,
                new NpgsqlParameter("userId", userId),
                new NpgsqlParameter("monthStart", monthStart),
                new NpgsqlParameter("nextMonthStart", nextMonthStart),
                new NpgsqlParameter("yearValue", year),
                new NpgsqlParameter("monthValue", monthNumber),
                new NpgsqlParameter("daysInMonth", daysInMonth),
                new NpgsqlParameter("previousYear", previousYear),
                new NpgsqlParameter("previousMonth", previousMonth),
                new NpgsqlParameter("previousDaysInMonth", previousDaysInMonth));
        }

        private async Task<List<Transaction>> QueryMonthTransactionsAsync(int userId, DateTime monthStart, DateTime nextMonthStart)
        {
            return await _repository.Get<Transaction>(t =>
                    t.Account.UserId == userId &&
                    t.TransactionDate >= monthStart &&
                    t.TransactionDate < nextMonthStart)
                .Include(t => t.Account)
                .Include(t => t.Category)
                .Include(t => t.Subcategory)
                .ToListAsync();
        }

        private async Task<Dictionary<int, bool>> QueryUserAccountCreditTypesAsync(int userId)
        {
            return await _repository.Get<Account>(a => a.UserId == userId)
                .AsNoTracking()
                .ToDictionaryAsync(a => a.AccountId, a => a.IsCredit);
        }

        private static DashboardFinancialSummary CalculateFinancialSummary(
            IEnumerable<Transaction> transactions,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
        {
            var summary = new DashboardFinancialSummary();
            var transactionList = transactions.ToList();

            foreach (var transaction in transactionList)
            {
                if (!accountCreditTypes.TryGetValue(transaction.AccountId, out var isCredit))
                {
                    continue;
                }

                if (IsTransactionType(transaction.Type, TransactionDomainConstants.TransactionType.Income))
                {
                    summary.AddIncome(transaction.AccountId, isCredit, transaction.Amount);
                }
                else if (IsTransactionType(transaction.Type, TransactionDomainConstants.TransactionType.Expense))
                {
                    summary.AddExpense(transaction.AccountId, isCredit, transaction.Amount);
                }
            }

            var pairedTransferIds = new HashSet<int>();
            foreach (var transferGroup in transactionList
                         .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) && t.TransferGroupId.HasValue)
                         .GroupBy(t => t.TransferGroupId)
                         .Where(g => g.Count() == 2))
            {
                var pair = transferGroup.ToList();
                pairedTransferIds.UnionWith(pair.Select(t => t.TransactionId));
                AddTransferFinancialImpact(summary, pair[0], pair[1], accountCreditTypes);
            }

            foreach (var transaction in transactionList.Where(t =>
                         IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) &&
                         !pairedTransferIds.Contains(t.TransactionId)))
            {
                AddTransferFinancialImpact(summary, transaction, accountCreditTypes);
            }

            return summary;
        }

        private static void AddTransferFinancialImpact(
            DashboardFinancialSummary summary,
            Transaction first,
            Transaction second,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
        {
            if (!accountCreditTypes.TryGetValue(first.AccountId, out var firstIsCredit) ||
                !accountCreditTypes.TryGetValue(second.AccountId, out var secondIsCredit) ||
                firstIsCredit == secondIsCredit)
            {
                return;
            }

            Transaction source;
            Transaction destination;
            if (first.BalanceImpact < 0)
            {
                source = first;
                destination = second;
            }
            else if (second.BalanceImpact < 0)
            {
                source = second;
                destination = first;
            }
            else if (first.BalanceImpact > 0)
            {
                source = second;
                destination = first;
            }
            else if (second.BalanceImpact > 0)
            {
                source = first;
                destination = second;
            }
            else
            {
                source = first.TransactionId < second.TransactionId ? first : second;
                destination = source == first ? second : first;
            }

            AddTransferFinancialImpact(summary, source.AccountId, destination.AccountId, source.Amount, accountCreditTypes);
        }

        private static void AddTransferFinancialImpact(
            DashboardFinancialSummary summary,
            Transaction transaction,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
        {
            if (!transaction.CounterpartyAccountId.HasValue)
            {
                return;
            }

            int sourceAccountId;
            int destinationAccountId;
            if (transaction.BalanceImpact < 0 ||
                (transaction.BalanceImpact == 0 && string.Equals(transaction.Direction, "debit", StringComparison.OrdinalIgnoreCase)))
            {
                sourceAccountId = transaction.AccountId;
                destinationAccountId = transaction.CounterpartyAccountId.Value;
            }
            else if (transaction.BalanceImpact > 0 ||
                     (transaction.BalanceImpact == 0 && string.Equals(transaction.Direction, "credit", StringComparison.OrdinalIgnoreCase)))
            {
                sourceAccountId = transaction.CounterpartyAccountId.Value;
                destinationAccountId = transaction.AccountId;
            }
            else
            {
                // Legacy zero-impact rows without Direction require the paired TransferGroupId row above.
                return;
            }

            AddTransferFinancialImpact(summary, sourceAccountId, destinationAccountId, transaction.Amount, accountCreditTypes);
        }

        private static void AddTransferFinancialImpact(
            DashboardFinancialSummary summary,
            int sourceAccountId,
            int destinationAccountId,
            decimal amount,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
        {
            if (!accountCreditTypes.TryGetValue(sourceAccountId, out var sourceIsCredit) ||
                !accountCreditTypes.TryGetValue(destinationAccountId, out var destinationIsCredit) ||
                sourceIsCredit == destinationIsCredit)
            {
                return;
            }

            if (!sourceIsCredit && destinationIsCredit)
            {
                summary.AddExpense(sourceAccountId, false, amount);
                summary.AddIncome(destinationAccountId, true, amount);
            }
            else if (sourceIsCredit)
            {
                summary.AddExpense(sourceAccountId, true, amount);
            }
        }

        private async Task<List<DashboardCreditChargeRow>> QueryMonthCreditChargesAsync(int userId, DateTime monthStart, DateTime nextMonthStart)
        {
            return await _repository.Get<CreditCharge>(c =>
                    c.Account.UserId == userId &&
                    c.OccurredAt >= monthStart &&
                    c.OccurredAt < nextMonthStart)
                .Include(c => c.InstallmentPlan)
                .Select(c => new DashboardCreditChargeRow
                {
                    AccountId = c.AccountId,
                    Amount = c.PrincipalAmount,
                    PlanType = c.InstallmentPlan != null ? c.InstallmentPlan.PlanType : TransactionDomainConstants.CreditPlanType.Revolving
                })
                .ToListAsync();
        }

        private static List<DashboardBreakdownItem> BuildAccountBreakdown(
            IReadOnlyDictionary<int, decimal> amounts,
            IEnumerable<DashboardAccountOverview> accounts)
        {
            var accountNames = accounts.ToDictionary(a => a.AccountId, a => a.Name);
            return BuildBreakdown(
                amounts.Select(amount => new DashboardBreakdownItem
                {
                    Id = amount.Key,
                    Name = accountNames.GetValueOrDefault(amount.Key, $"Cuenta {amount.Key}"),
                    Amount = amount.Value
                }),
                AccountTopLimit);
        }

        private static List<DashboardBreakdownItem> BuildBreakdown(IEnumerable<DashboardBreakdownItem> source, int? limit = null)
        {
            var ordered = source
                .Where(x => x.Amount != 0)
                .OrderByDescending(x => Math.Abs(x.Amount))
                .ThenBy(x => x.Name)
                .ToList();

            if (!limit.HasValue || ordered.Count <= limit.Value)
            {
                return ordered;
            }

            var top = ordered.Take(limit.Value).ToList();
            var others = ordered.Skip(limit.Value).ToList();
            var othersAmount = others.Sum(x => x.Amount);

            if (othersAmount != 0)
            {
                top.Add(new DashboardBreakdownItem
                {
                    Id = null,
                    Name = "Otros",
                    Amount = othersAmount,
                    CashAmount = others.Sum(x => x.CashAmount),
                    CreditAmount = others.Sum(x => x.CreditAmount)
                });
            }

            return top;
        }

        private static bool IsTransactionType(string? actual, string expected)
        {
            return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
        }

        private sealed class DashboardCreditChargeRow
        {
            public int AccountId { get; set; }
            public decimal Amount { get; set; }
            public string PlanType { get; set; } = TransactionDomainConstants.CreditPlanType.Revolving;
        }

        private sealed class DashboardFinancialSummary
        {
            public decimal CashIncome { get; private set; }
            public decimal CashExpense { get; private set; }
            public decimal CreditIncome { get; private set; }
            public decimal CreditExpense { get; private set; }
            public Dictionary<int, decimal> IncomeByAccount { get; } = [];
            public Dictionary<int, decimal> ExpenseByAccount { get; } = [];
            public decimal CashFinancialNet => CashIncome - CashExpense;
            public decimal CreditFinancialNet => CreditIncome - CreditExpense;

            public void AddIncome(int accountId, bool isCredit, decimal amount)
            {
                IncomeByAccount[accountId] = IncomeByAccount.GetValueOrDefault(accountId) + amount;
                if (isCredit)
                {
                    CreditIncome += amount;
                    return;
                }

                CashIncome += amount;
            }

            public void AddExpense(int accountId, bool isCredit, decimal amount)
            {
                ExpenseByAccount[accountId] = ExpenseByAccount.GetValueOrDefault(accountId) + amount;
                if (isCredit)
                {
                    CreditExpense += amount;
                    return;
                }

                CashExpense += amount;
            }
        }
    }
}
