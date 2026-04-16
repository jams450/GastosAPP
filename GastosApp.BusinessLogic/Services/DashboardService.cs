using System.Globalization;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Dashboard;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Microsoft.EntityFrameworkCore;

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
            var monthEnd = new DateTime(year, monthNumber, DateTime.DaysInMonth(year, monthNumber), 23, 59, 59, DateTimeKind.Utc);

            var accounts = await _repository.Get<Account>(a => a.UserId == userId)
                .OrderBy(a => a.Name)
                .ToListAsync();

            var accountIds = accounts.Select(a => a.AccountId).ToList();

            var monthExpenses = accountIds.Count == 0
                ? 0m
                : await _repository.Get<Transaction>(t =>
                    accountIds.Contains(t.AccountId) &&
                    t.Type == "expense" &&
                    t.TransactionDate >= monthStart &&
                    t.TransactionDate <= monthEnd)
                .SumAsync(t => (decimal?)t.Amount) ?? 0m;

            var accountOverviews = new List<DashboardAccountOverview>(accounts.Count);
            foreach (var account in accounts)
            {
                if (!account.IsCredit)
                {
                    accountOverviews.Add(new DashboardAccountOverview
                    {
                        AccountId = account.AccountId,
                        Name = account.Name,
                        Active = account.Active,
                        IsCredit = false,
                        CurrentBalance = account.CurrentBalance,
                        CreditLimit = account.CreditLimit
                    });

                    continue;
                }

                var cutoffDay = account.DueDay ?? DateTime.DaysInMonth(year, monthNumber);
                var periodEnd = CreateSafeDate(year, monthNumber, cutoffDay);
                var previousCutoff = CreateSafeDate(periodEnd.AddMonths(-1).Year, periodEnd.AddMonths(-1).Month, cutoffDay);
                var periodStart = previousCutoff.AddDays(1);

                var periodSpent = await _repository.Get<Transaction>(t =>
                        t.AccountId == account.AccountId &&
                        t.Type == "expense" &&
                        t.TransactionDate >= periodStart &&
                        t.TransactionDate <= periodEnd)
                    .SumAsync(t => (decimal?)t.Amount) ?? 0m;

                accountOverviews.Add(new DashboardAccountOverview
                {
                    AccountId = account.AccountId,
                    Name = account.Name,
                    Active = account.Active,
                    IsCredit = true,
                    CutoffDay = account.DueDay,
                    PaymentDueDay = account.PaymentDueDay,
                    CurrentBalance = account.CurrentBalance,
                    CreditLimit = account.CreditLimit,
                    PeriodStart = periodStart,
                    PeriodEnd = periodEnd,
                    PeriodSpent = periodSpent,
                    PendingInformative = periodSpent
                });
            }

            return new DashboardCreditOverview
            {
                Month = $"{year:D4}-{monthNumber:D2}",
                Timezone = timezoneId,
                Summary = new DashboardSummary
                {
                    CashTotal = accounts.Where(a => !a.IsCredit).Sum(a => a.CurrentBalance),
                    CreditUsed = accounts.Where(a => a.IsCredit).Sum(a => a.CurrentBalance),
                    PendingInformative = accountOverviews.Where(a => a.IsCredit).Sum(a => a.PendingInformative),
                    MonthExpenses = monthExpenses
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

        private static DateTime CreateSafeDate(int year, int month, int day)
        {
            var maxDay = DateTime.DaysInMonth(year, month);
            var safeDay = Math.Clamp(day, 1, maxDay);
            return new DateTime(year, month, safeDay, 0, 0, 0, DateTimeKind.Utc);
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
