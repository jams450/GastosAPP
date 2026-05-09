using System.Globalization;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Dashboard;
using Mapster;
using Npgsql;

namespace GastosApp.BusinessLogic.Services
{
    public class DashboardService : IDashboardService
    {
        private readonly IRepository _repository;

        public DashboardService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<DashboardCreditOverview> GetCreditOverviewAsync(int userId, string? month, string timezoneId = "America/Mexico_City")
        {
            var (year, monthNumber) = ResolveMonth(month, timezoneId);
            var monthStart = new DateTime(year, monthNumber, 1, 0, 0, 0, DateTimeKind.Utc);
            var nextMonthStart = monthStart.AddMonths(1);
            var previousMonthDate = monthStart.AddMonths(-1);
            var sql = @"
                    SELECT *
                    FROM fn_dashboard_credit_overview(
                        @userId,
                        @monthStart,
                        @nextMonthStart,
                        @yearValue,
                        @monthValue,
                        @previousYear,
                        @previousMonth
                    )
                    ORDER BY ""Name"";";

            var accountRows = await _repository.SqlQueryAsync<DashboardAccountSqlRow>(
                sql,
                new NpgsqlParameter("userId", userId),
                new NpgsqlParameter("monthStart", monthStart),
                new NpgsqlParameter("nextMonthStart", nextMonthStart),
                new NpgsqlParameter("yearValue", year),
                new NpgsqlParameter("monthValue", monthNumber),
                new NpgsqlParameter("previousYear", previousMonthDate.Year),
                new NpgsqlParameter("previousMonth", previousMonthDate.Month));

            var accountOverviews = accountRows.Adapt<List<DashboardAccountOverview>>();

            return new DashboardCreditOverview
            {
                Month = $"{year:D4}-{monthNumber:D2}",
                Timezone = timezoneId,
                Summary = new DashboardSummary
                {
                    CashTotal = accountOverviews.Where(a => !a.IsCredit).Sum(a => a.ClosingBalance),
                    CreditUsed = accountOverviews.Where(a => a.IsCredit).Sum(a => a.ClosingBalance),
                    TotalDebt = accountOverviews.Where(a => a.IsCredit).Sum(a => (a.CreditLimit ?? 0m) - a.ClosingBalance),
                    CreditDebtMsi = accountOverviews.Where(a => a.IsCredit).Sum(a => a.MsiOutstanding),
                    CreditDebtNormal = accountOverviews.Where(a => a.IsCredit).Sum(a => a.NormalOutstanding),
                    MonthIncome = accountOverviews.Sum(a => a.MonthIncome),
                    MonthExpense = accountOverviews.Sum(a => a.MonthExpense)
                },
                Accounts = accountOverviews
            };
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

    }
}
