using System.Globalization;
using GastosApp.BusinessLogic.Context;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Dashboard;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace GastosApp.BusinessLogic.Services
{
    public class DashboardService : IDashboardService
    {
        private readonly ContextSqlGastos _context;

        public DashboardService(ContextSqlGastos context)
        {
            _context = context;
        }

        public async Task<DashboardCreditOverview> GetCreditOverviewAsync(int userId, string? month, string timezoneId = "America/Mexico_City")
        {
            var (year, monthNumber) = ResolveMonth(month, timezoneId);
            var monthStart = new DateTime(year, monthNumber, 1, 0, 0, 0, DateTimeKind.Utc);
            var nextMonthStart = monthStart.AddMonths(1);
            var previousMonthDate = monthStart.AddMonths(-1);
            var daysInMonth = DateTime.DaysInMonth(year, monthNumber);
            var previousDaysInMonth = DateTime.DaysInMonth(previousMonthDate.Year, previousMonthDate.Month);

            var sql = @"
WITH accounts_scope AS (
    SELECT
        a.account_id,
        a.name,
        a.active,
        a.is_credit,
        a.due_day,
        a.payment_due_day,
        a.initial_balance,
        a.credit_limit
    FROM accounts a
    WHERE a.user_id = @userId
),
tx_scope AS (
    SELECT
        t.transaction_id,
        t.account_id,
        t.type,
        t.transfer_group_id,
        t.amount,
        t.balance_impact,
        t.transaction_date
    FROM transactions t
    INNER JOIN accounts_scope a ON a.account_id = t.account_id
    WHERE t.transaction_date < @nextMonthStart
),
transfer_rank AS (
    SELECT
        t.transaction_id,
        row_number() OVER (PARTITION BY t.transfer_group_id ORDER BY t.transaction_id) AS row_num,
        count(*) OVER (PARTITION BY t.transfer_group_id) AS group_size
    FROM tx_scope t
    WHERE lower(t.type) = 'transfer' AND t.transfer_group_id IS NOT NULL
),
tx_with_impact AS (
    SELECT
        t.account_id,
        t.transaction_date,
        CASE
            WHEN t.balance_impact <> 0 THEN t.balance_impact
            WHEN lower(t.type) = 'income' THEN t.amount
            WHEN lower(t.type) = 'expense' THEN t.amount * -1
            WHEN lower(t.type) = 'transfer' AND t.transfer_group_id IS NULL THEN t.amount
            WHEN lower(t.type) = 'transfer' THEN
                CASE
                    WHEN coalesce(r.group_size, 0) < 2 THEN t.amount
                    WHEN r.row_num = 1 THEN t.amount * -1
                    ELSE t.amount
                END
            ELSE 0
        END AS impact
    FROM tx_scope t
    LEFT JOIN transfer_rank r ON r.transaction_id = t.transaction_id
),
month_agg AS (
    SELECT
        a.account_id,
        coalesce(sum(CASE WHEN t.transaction_date < @monthStart THEN t.impact ELSE 0 END), 0) AS prior_impact,
        coalesce(sum(CASE WHEN t.transaction_date >= @monthStart AND t.transaction_date < @nextMonthStart AND t.impact > 0 THEN t.impact ELSE 0 END), 0) AS month_income,
        coalesce(sum(CASE WHEN t.transaction_date >= @monthStart AND t.transaction_date < @nextMonthStart AND t.impact < 0 THEN (t.impact * -1) ELSE 0 END), 0) AS month_expense,
        coalesce(sum(CASE WHEN t.transaction_date >= @monthStart AND t.transaction_date < @nextMonthStart THEN t.impact ELSE 0 END), 0) AS month_net
    FROM accounts_scope a
    LEFT JOIN tx_with_impact t ON t.account_id = a.account_id
    GROUP BY a.account_id
),
credit_bounds AS (
    SELECT
        a.account_id,
        CASE WHEN a.is_credit THEN make_date(@yearValue, @monthValue, LEAST(GREATEST(coalesce(a.due_day, @daysInMonth), 1), @daysInMonth)) END AS period_end,
        CASE WHEN a.is_credit THEN (make_date(@previousYear, @previousMonth, LEAST(GREATEST(coalesce(a.due_day, @previousDaysInMonth), 1), @previousDaysInMonth)) + INTERVAL '1 day')::date END AS period_start
    FROM accounts_scope a
),
credit_spent AS (
    SELECT
        cb.account_id,
        coalesce(sum(CASE WHEN lower(t.type) = 'expense' THEN t.amount ELSE 0 END), 0) AS period_spent,
        GREATEST(coalesce(sum(ti.impact), 0) * -1, 0) AS estimated_cutoff_payment
    FROM credit_bounds cb
    LEFT JOIN transactions t
        ON t.account_id = cb.account_id
        AND cb.period_start IS NOT NULL
        AND cb.period_end IS NOT NULL
        AND t.transaction_date >= cb.period_start
        AND t.transaction_date < (cb.period_end + INTERVAL '1 day')
    LEFT JOIN tx_with_impact ti
        ON ti.account_id = cb.account_id
        AND cb.period_start IS NOT NULL
        AND cb.period_end IS NOT NULL
        AND ti.transaction_date >= cb.period_start
        AND ti.transaction_date < (cb.period_end + INTERVAL '1 day')
    GROUP BY cb.account_id
),
installment_paid AS (
    SELECT
        ia.installment_id,
        coalesce(sum(ia.allocated_amount), 0) AS allocated_total
    FROM installment_allocations ia
    INNER JOIN credit_payments cp ON cp.payment_id = ia.payment_id AND cp.status = 'Posted'
    GROUP BY ia.installment_id
),
credit_installment_breakdown AS (
    SELECT
        cip.account_id,
        coalesce(sum(CASE
            WHEN cip.plan_type = 'MSI' THEN GREATEST(ci.total_due - coalesce(ip.allocated_total, 0), 0)
            ELSE 0
        END), 0) AS msi_outstanding,
        coalesce(sum(CASE
            WHEN cip.plan_type = 'Revolving' THEN GREATEST(ci.total_due - coalesce(ip.allocated_total, 0), 0)
            ELSE 0
        END), 0) AS normal_outstanding
    FROM credit_installments ci
    INNER JOIN credit_installment_plans cip ON cip.plan_id = ci.plan_id
    INNER JOIN accounts_scope a ON a.account_id = cip.account_id AND a.is_credit = TRUE
    LEFT JOIN installment_paid ip ON ip.installment_id = ci.installment_id
    WHERE ci.status IN ('Open', 'PartiallyPaid', 'Overdue')
    GROUP BY cip.account_id
)
SELECT
    a.account_id AS ""AccountId"",
    a.name AS ""Name"",
    a.active AS ""Active"",
    a.is_credit AS ""IsCredit"",
    a.due_day AS ""CutoffDay"",
    a.payment_due_day AS ""PaymentDueDay"",
    a.initial_balance AS ""InitialBalance"",
    (a.initial_balance + coalesce(m.prior_impact, 0)) AS ""OpeningBalance"",
    coalesce(m.month_income, 0) AS ""MonthIncome"",
    coalesce(m.month_expense, 0) AS ""MonthExpense"",
    coalesce(m.month_net, 0) AS ""MonthNet"",
    (a.initial_balance + coalesce(m.prior_impact, 0) + coalesce(m.month_net, 0)) AS ""ClosingBalance"",
    a.credit_limit AS ""CreditLimit"",
    cb.period_start AS ""PeriodStart"",
    cb.period_end AS ""PeriodEnd"",
    coalesce(cs.period_spent, 0) AS ""PeriodSpent"",
    coalesce(cs.estimated_cutoff_payment, 0) AS ""EstimatedCutoffPayment"",
    coalesce(cib.msi_outstanding, 0) AS ""MsiOutstanding"",
    coalesce(cib.normal_outstanding, 0) AS ""NormalOutstanding""
FROM accounts_scope a
LEFT JOIN month_agg m ON m.account_id = a.account_id
LEFT JOIN credit_bounds cb ON cb.account_id = a.account_id
LEFT JOIN credit_spent cs ON cs.account_id = a.account_id
LEFT JOIN credit_installment_breakdown cib ON cib.account_id = a.account_id
ORDER BY a.name;";

            var accountRows = await _context.Database
                .SqlQueryRaw<DashboardAccountSqlRow>(
                    sql,
                    new NpgsqlParameter("userId", userId),
                    new NpgsqlParameter("monthStart", monthStart),
                    new NpgsqlParameter("nextMonthStart", nextMonthStart),
                    new NpgsqlParameter("yearValue", year),
                    new NpgsqlParameter("monthValue", monthNumber),
                    new NpgsqlParameter("daysInMonth", daysInMonth),
                    new NpgsqlParameter("previousYear", previousMonthDate.Year),
                    new NpgsqlParameter("previousMonth", previousMonthDate.Month),
                    new NpgsqlParameter("previousDaysInMonth", previousDaysInMonth))
                .ToListAsync();

            var accountOverviews = accountRows.Select(row => new DashboardAccountOverview
            {
                AccountId = row.AccountId,
                Name = row.Name,
                Active = row.Active,
                IsCredit = row.IsCredit,
                CutoffDay = row.CutoffDay,
                PaymentDueDay = row.PaymentDueDay,
                InitialBalance = row.InitialBalance,
                OpeningBalance = row.OpeningBalance,
                MonthIncome = row.MonthIncome,
                MonthExpense = row.MonthExpense,
                MonthNet = row.MonthNet,
                ClosingBalance = row.ClosingBalance,
                CreditLimit = row.CreditLimit,
                PeriodStart = row.PeriodStart,
                PeriodEnd = row.PeriodEnd,
                PeriodSpent = row.PeriodSpent,
                EstimatedCutoffPayment = row.EstimatedCutoffPayment,
                MsiOutstanding = row.MsiOutstanding,
                NormalOutstanding = row.NormalOutstanding
            }).ToList();

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

        private sealed class DashboardAccountSqlRow
        {
            public int AccountId { get; set; }
            public string Name { get; set; } = string.Empty;
            public bool Active { get; set; }
            public bool IsCredit { get; set; }
            public int? CutoffDay { get; set; }
            public int? PaymentDueDay { get; set; }
            public decimal InitialBalance { get; set; }
            public decimal OpeningBalance { get; set; }
            public decimal MonthIncome { get; set; }
            public decimal MonthExpense { get; set; }
            public decimal MonthNet { get; set; }
            public decimal ClosingBalance { get; set; }
            public decimal? CreditLimit { get; set; }
            public DateTime? PeriodStart { get; set; }
            public DateTime? PeriodEnd { get; set; }
            public decimal PeriodSpent { get; set; }
            public decimal EstimatedCutoffPayment { get; set; }
            public decimal MsiOutstanding { get; set; }
            public decimal NormalOutstanding { get; set; }
        }
    }
}
