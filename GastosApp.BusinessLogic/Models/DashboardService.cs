using System.Globalization;
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

        public async Task<DashboardOverviewResponse> GetOverviewAsync(int userId, string? month, string timezoneId = "America/Mexico_City")
        {
            var (year, monthNumber) = ResolveMonth(month, timezoneId);
            var monthStart = new DateTime(year, monthNumber, 1, 0, 0, 0, DateTimeKind.Utc);
            var nextMonthStart = monthStart.AddMonths(1);
            var previousMonthDate = monthStart.AddMonths(-1);
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
            var monthCreditCharges = await QueryMonthCreditChargesAsync(userId, monthStart, nextMonthStart);

            var creditAccounts = accounts.Where(a => a.IsCredit).ToList();
            var cashAccounts = accounts.Where(a => !a.IsCredit).ToList();

            return new DashboardOverviewResponse
            {
                Month = $"{year:D4}-{monthNumber:D2}",
                Timezone = timezoneId,
                GeneralSummary = new DashboardGeneralSummary
                {
                    MonthIncome = accounts.Sum(a => a.MonthIncome),
                    MonthExpense = accounts.Sum(a => a.MonthExpense)
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
                                Amount = g.Sum(t => t.Amount)
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
                                Amount = g.Sum(t => t.Amount)
                            }),
                        SubcategoryTopLimit),
                    IncomeByAccount = BuildBreakdown(
                        monthTransactions
                            .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Income))
                            .GroupBy(t => new { t.AccountId, t.Account.Name })
                            .Select(g => new DashboardBreakdownItem
                            {
                                Id = g.Key.AccountId,
                                Name = g.Key.Name,
                                Amount = g.Sum(t => t.Amount)
                            }),
                        AccountTopLimit),
                    TransferByAccount = BuildBreakdown(
                        monthTransactions
                            .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer))
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
                    MonthIncome = creditAccounts.Sum(a => a.MonthIncome),
                    MonthExpense = creditAccounts.Sum(a => a.MonthExpense),
                    MonthNet = creditAccounts.Sum(a => a.MonthNet),
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
                    MonthIncome = cashAccounts.Sum(a => a.MonthIncome),
                    MonthExpense = cashAccounts.Sum(a => a.MonthExpense),
                    MonthNet = cashAccounts.Sum(a => a.MonthNet)
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
            var othersAmount = ordered.Skip(limit.Value).Sum(x => x.Amount);

            if (othersAmount != 0)
            {
                top.Add(new DashboardBreakdownItem
                {
                    Id = null,
                    Name = "Otros",
                    Amount = othersAmount
                });
            }

            return top;
        }

        private static bool IsTransactionType(string? actual, string expected)
        {
            return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
        }

        private static (int Year, int Month) ResolveMonth(string? month, string timezoneId)
        {
            if (!string.IsNullOrWhiteSpace(month) &&
                DateTime.TryParseExact(month, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            {
                return (parsed.Year, parsed.Month);
            }

            var timezone = ResolveTimeZone(timezoneId);
            var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone);
            return (localNow.Year, localNow.Month);
        }

        private static TimeZoneInfo ResolveTimeZone(string timezoneId)
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(timezoneId);
            }
            catch (TimeZoneNotFoundException)
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Central Standard Time (Mexico)");
            }
        }

        private sealed class DashboardCreditChargeRow
        {
            public int AccountId { get; set; }
            public decimal Amount { get; set; }
            public string PlanType { get; set; } = TransactionDomainConstants.CreditPlanType.Revolving;
        }
    }
}
