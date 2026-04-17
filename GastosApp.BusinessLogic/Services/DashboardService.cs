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

            var transactions = accountIds.Count == 0
                ? new List<Transaction>()
                : await _repository.Get<Transaction>(t =>
                        accountIds.Contains(t.AccountId) &&
                        t.TransactionDate <= monthEnd)
                    .OrderBy(t => t.TransactionDate)
                    .ThenBy(t => t.TransactionId)
                    .ToListAsync();

            var transactionIdsByTransferGroup = transactions
                .Where(t => t.Type == "transfer" && t.TransferGroupId.HasValue)
                .GroupBy(t => t.TransferGroupId!.Value)
                .ToDictionary(
                    g => g.Key,
                    g => g.Select(x => x.TransactionId).OrderBy(id => id).ToArray());

            var accountTransactions = transactions
                .GroupBy(t => t.AccountId)
                .ToDictionary(g => g.Key, g => g.ToList());

            var accountOverviews = new List<DashboardAccountOverview>(accounts.Count);
            foreach (var account in accounts)
            {
                var tx = accountTransactions.TryGetValue(account.AccountId, out var accountTx)
                    ? accountTx
                    : new List<Transaction>();

                var openingBalance = account.InitialBalance + tx
                    .Where(t => t.TransactionDate < monthStart)
                    .Sum(t => ResolveImpact(t, transactionIdsByTransferGroup));

                var monthTransactions = tx
                    .Where(t => t.TransactionDate >= monthStart && t.TransactionDate <= monthEnd)
                    .ToList();

                var monthIncome = monthTransactions
                    .Select(t => ResolveImpact(t, transactionIdsByTransferGroup))
                    .Where(impact => impact > 0)
                    .Sum();

                var monthExpense = monthTransactions
                    .Select(t => ResolveImpact(t, transactionIdsByTransferGroup))
                    .Where(impact => impact < 0)
                    .Sum(impact => impact * -1);

                var monthNet = monthTransactions.Sum(t => ResolveImpact(t, transactionIdsByTransferGroup));
                var closingBalance = openingBalance + monthNet;

                if (!account.IsCredit)
                {
                    accountOverviews.Add(new DashboardAccountOverview
                    {
                        AccountId = account.AccountId,
                        Name = account.Name,
                        Active = account.Active,
                        IsCredit = false,
                        InitialBalance = account.InitialBalance,
                        OpeningBalance = openingBalance,
                        MonthIncome = monthIncome,
                        MonthExpense = monthExpense,
                        MonthNet = monthNet,
                        ClosingBalance = closingBalance,
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
                    InitialBalance = account.InitialBalance,
                    OpeningBalance = openingBalance,
                    MonthIncome = monthIncome,
                    MonthExpense = monthExpense,
                    MonthNet = monthNet,
                    ClosingBalance = closingBalance,
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
                    CashTotal = accountOverviews.Where(a => !a.IsCredit).Sum(a => a.ClosingBalance),
                    CreditUsed = accountOverviews.Where(a => a.IsCredit).Sum(a => a.ClosingBalance),
                    TotalDebt = accountOverviews.Where(a => a.IsCredit).Sum(a => (a.CreditLimit ?? 0m) - a.ClosingBalance),
                    MonthIncome = accountOverviews.Sum(a => a.MonthIncome),
                    MonthExpense = accountOverviews.Sum(a => a.MonthExpense)
                },
                Accounts = accountOverviews
            };
        }

        private static decimal ResolveImpact(Transaction transaction, IReadOnlyDictionary<Guid, int[]> transactionIdsByTransferGroup)
        {
            if (transaction.BalanceImpact != 0)
            {
                return transaction.BalanceImpact;
            }

            return transaction.Type.ToLowerInvariant() switch
            {
                "income" => transaction.Amount,
                "expense" => transaction.Amount * -1,
                "transfer" when transaction.TransferGroupId.HasValue
                    => InferTransferImpact(transaction, transactionIdsByTransferGroup),
                _ => 0m
            };
        }

        private static decimal InferTransferImpact(Transaction transaction, IReadOnlyDictionary<Guid, int[]> transactionIdsByTransferGroup)
        {
            if (!transaction.TransferGroupId.HasValue ||
                !transactionIdsByTransferGroup.TryGetValue(transaction.TransferGroupId.Value, out var orderedIds) ||
                orderedIds.Length < 2)
            {
                return transaction.Amount;
            }

            return transaction.TransactionId == orderedIds[0]
                ? transaction.Amount * -1
                : transaction.Amount;
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
