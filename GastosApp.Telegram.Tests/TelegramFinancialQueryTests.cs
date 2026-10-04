using GastosApp.API.Services.Telegram;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Dashboard;
using GastosApp.BusinessLogic.Services;
using Microsoft.Extensions.AI;

internal static class TelegramFinancialQueryTests
{
    public static async Task RunAsync()
    {
        var dashboard = new FakeDashboard();
        var budgets = new FakeTelegramBudgetService();
        var alerts = new FakeTelegramAlertService();
        var service = new TelegramToolService(null!, null!, null!, null!, null!, null!, dashboard, budgets, alerts);
        var request = new TelegramFinancialRequest("2026-09");
        var cash = (TelegramCashBalances)await service.SaldosEfectivoAsync(request, 73, default);
        Check(cash.TotalBalance == 100 && cash.TotalAccounts == 1 && cash.Accounts.Single().AccountId == 1,
            "Cash excludes credit and uses current balance");
        Check(dashboard.Last == (73, "2026-09", "America/Mexico_City"), "Persisted identity and timezone forwarded");
        var credit = (TelegramAvailableCredit)await service.CreditoDisponibleAsync(request, 73, default);
        Check(credit.KnownAvailable == -20 && !credit.IsComplete && credit.UnknownLimitAccounts == 1,
            "Negative availability preserved and missing limits disclosed");
        Check(credit.Accounts.Single(x => x.AccountId == 3).Available is null, "Unknown available remains null");
        foreach (var (scope, income, expense, net) in new[]
        {
            ("all", 90m, 60m, 30m), ("cash", 70m, 40m, 30m), ("credit", 20m, 20m, 0m)
        })
        {
            var result = (TelegramFinancialSummary)await service.ResumenFinancieroAsync(new("2026-09", scope), 73, default);
            Check(result.Income == income && result.Expense == expense && result.Net == net,
                $"Dashboard financial totals for {scope}, not account balance-impact sums");
        }
        foreach (var month in new[] { "2026-13", "2026-9", "bad", "", " ", "0000-01" })
        {
            var calls = dashboard.Calls;
            Check(await service.SaldosEfectivoAsync(new(month), 73, default) is TelegramToolService.ToolError,
                $"Invalid month rejected: {month}");
            Check(dashboard.Calls == calls, "Invalid request never calls dashboard");
        }
        foreach (var scope in new[] { "other", "", "CASH", " cash " })
        {
            var calls = dashboard.Calls;
            Check(await service.ResumenFinancieroAsync(new(null, scope), 73, default) is TelegramToolService.ToolError,
                "Invalid scope rejected");
            Check(dashboard.Calls == calls, "Invalid scope never calls dashboard");
        }
        var defaultSummary = (TelegramFinancialSummary)await service.ResumenFinancieroAsync(new(), 73, default);
        Check(defaultSummary.Scope == "all" && defaultSummary.Net == 30, "Default scope all");
        await service.SaldosEfectivoAsync(new(), 73, default);
        Check(dashboard.Last.Month == MonthRangeResolver.CurrentPeriodKey("America/Mexico_City"), "Default Mexico current month");
        dashboard.Overview.Accounts = Enumerable.Range(1, 55).Select(id => new DashboardAccountOverview
        {
            AccountId = id, Name = $"Cash {id}", CurrentBalance = 2
        }).ToList();
        cash = (TelegramCashBalances)await service.SaldosEfectivoAsync(request, 73, default);
        Check(cash.TotalBalance == 110 && cash.TotalAccounts == 55 && cash.Accounts.Count == 50 && cash.Truncated,
            "Totals computed before bounded detail");
        dashboard.Overview.Accounts = Enumerable.Range(1, 55).Select(id => new DashboardAccountOverview
        {
            AccountId = id, Name = $"Credit {id}", IsCredit = true,
            CreditLimit = id == 55 ? null : 10, NormalOutstanding = 12
        }).ToList();
        credit = (TelegramAvailableCredit)await service.CreditoDisponibleAsync(request, 73, default);
        Check(credit.KnownAvailable == -108 && credit.TotalAccounts == 55 && credit.Accounts.Count == 50 && credit.Truncated,
            "Credit aggregate includes omitted accounts");
        Check(!credit.IsComplete && credit.UnknownLimitAccounts == 1 && credit.Accounts.All(x => x.Available.HasValue),
            "Unknown limit beyond detail cap still disclosed");
        dashboard.Overview.Accounts = [];
        credit = (TelegramAvailableCredit)await service.CreditoDisponibleAsync(request, 73, default);
        Check(credit.KnownAvailable == 0 && credit.IsComplete && credit.TotalAccounts == 0, "Empty credit result");
        cash = (TelegramCashBalances)await service.SaldosEfectivoAsync(request, 73, default);
        Check(cash.TotalBalance == 0 && cash.Accounts.Count == 0, "Empty cash result");
        var functions = ExpenseAgentService.CreateFinancialTools(service, 91, default);
        foreach (var function in functions)
        {
            Check(!function.JsonSchema.ToString().Contains("userId", StringComparison.OrdinalIgnoreCase),
                "LLM cannot supply identity");
            await function.InvokeAsync(new AIFunctionArguments
            {
                ["request"] = function.Name == "alertas_presupuesto" ? new TelegramAlertRequest(request.Mes) : (object)request
            });
            Check(function.Name == "alertas_presupuesto" ? alerts.Last.UserId == 91 :
                function.Name == "presupuestos" ? budgets.Last.UserId == 91 : dashboard.Last.UserId == 91,
                "Actual registered function binds identity");
        }
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        try
        {
            await service.CreditoDisponibleAsync(request, 73, cancelled.Token);
            throw new Exception("Cancellation not propagated");
        }
        catch (OperationCanceledException) { }
        await PaymentQueriesAsync();
        Console.WriteLine("PASS Telegram financial queries (offline fake dashboard and actual function registration)");
    }

    private static async Task PaymentQueriesAsync()
    {
        var dashboard = new FakeDashboard();
        var service = new TelegramToolService(null!, null!, null!, null!, null!, null!, dashboard,
            new FakeTelegramBudgetService(), new FakeTelegramAlertService());
        var start = new DateTime(2026, 8, 18, 6, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 9, 17, 6, 0, 0, DateTimeKind.Utc);
        dashboard.Overview.Accounts = new[]
        {
            new DashboardAccountOverview { AccountId = 1, EstimatedCutoffCharges = 999, CutoffPending = 999 },
            new DashboardAccountOverview
            {
                AccountId = 2, Name = "Card", IsCredit = true, EstimatedCutoffCharges = 120,
                CutoffPayments = 150, CutoffPending = 7, PeriodStart = start, PeriodEnd = end
            },
            new DashboardAccountOverview { AccountId = 3, IsCredit = true, EstimatedCutoffCharges = 40, CutoffPayments = 10, CutoffPending = 30 }
        };
        var result = (TelegramCutoffPayments)await service.PagoTarjetasAsync(new("2026-09"), 84, default);
        Check(result.Estimated == 160 && result.Paid == 160 && result.Pending == 37 && result.TotalAccounts == 2,
            "Payment totals use exact dashboard fields, not recomputed estimate minus paid");
        var card = result.Accounts.Single(x => x.AccountId == 2);
        Check(card.Name == "Card" && card.Estimated == 120 && card.Paid == 150 && card.Pending == 7,
            "Payment per-account mapping");
        Check(card.PeriodStart == start && card.PeriodEnd == end && result.Accounts.Single(x => x.AccountId == 3).PeriodStart is null,
            "Cutoff cycle dates copied exactly, including null, not calendar-month boundaries");
        Check(dashboard.Last == (84, "2026-09", "America/Mexico_City"), "Payment month timezone and identity");
        Check(result.Month == "2026-09" && result.Timezone == "America/Mexico_City" && !result.Truncated,
            "Payment month and timezone metadata");
        Check(result.PaymentBasis.Contains("corte") && result.PaymentBasis.Contains("No es pago mínimo"),
            "Payment result discloses cutoff semantics");
        foreach (var month in new[] { "", "bad", "2026-13", "2026-9", "0000-01" })
        {
            var calls = dashboard.Calls;
            Check(await service.PagoTarjetasAsync(new(month), 84, default) is TelegramToolService.ToolError,
                "Invalid payment month rejected");
            Check(dashboard.Calls == calls, "Invalid payment month skips dashboard");
        }
        var beforeInvalid = dashboard.Calls;
        Check(await service.PagoTarjetasAsync(new(null, "invalid"), 84, default) is TelegramToolService.ToolError &&
            dashboard.Calls == beforeInvalid, "Shared scope validation applies to payments");
        await service.PagoTarjetasAsync(new(), 84, default);
        Check(dashboard.Last.Month == MonthRangeResolver.CurrentPeriodKey("America/Mexico_City"), "Payment default Mexico month");
        dashboard.Overview.Accounts = Enumerable.Range(1, 55).Select(id => new DashboardAccountOverview
        {
            AccountId = id, IsCredit = true, EstimatedCutoffCharges = 10, CutoffPayments = 3, CutoffPending = 7
        }).ToList();
        result = (TelegramCutoffPayments)await service.PagoTarjetasAsync(new("2026-09"), 84, default);
        Check(result.Estimated == 550 && result.Paid == 165 && result.Pending == 385 && result.TotalAccounts == 55 &&
            result.Truncated && result.Accounts.Count == 50, "All payment totals precede detail cap");
        dashboard.Overview.Accounts = new[] { new DashboardAccountOverview { EstimatedCutoffCharges = 999 } };
        result = (TelegramCutoffPayments)await service.PagoTarjetasAsync(new(), 84, default);
        Check(result.Estimated == 0 && result.Paid == 0 && result.Pending == 0 && result.TotalAccounts == 0 &&
            result.Accounts.Count == 0 && !result.Truncated, "No credit accounts gives empty payments");
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        var beforeCancel = dashboard.Calls;
        try
        {
            await service.PagoTarjetasAsync(new(), 84, cancelled.Token);
            throw new Exception("Payment cancellation not propagated");
        }
        catch (OperationCanceledException) { }
        Check(dashboard.Calls == beforeCancel, "Cancelled payment skips dashboard");
        var function = ExpenseAgentService.CreateFinancialTools(service, 92, default).Single(x => x.Name == "pago_tarjetas");
        Check(!function.JsonSchema.ToString().Contains("userId", StringComparison.OrdinalIgnoreCase), "Payment schema hides identity");
        await function.InvokeAsync(new AIFunctionArguments { ["request"] = new TelegramFinancialRequest("2026-09") });
        Check(dashboard.Last == (92, "2026-09", "America/Mexico_City"), "Registered payment function binds identity");
        Console.WriteLine("PASS Telegram cutoff payment queries (offline mapping, cycles, totals and registration)");
    }

    private static void Check(bool condition, string name)
    {
        if (!condition) throw new Exception(name);
    }

    private sealed class FakeDashboard : IDashboardService
    {
        public int Calls { get; private set; }
        public (int UserId, string? Month, string Timezone) Last { get; private set; }
        public DashboardOverviewResponse Overview { get; } = new()
        {
            Month = "2026-09",
            GeneralSummary = new() { MonthIncome = 90, MonthExpense = 60, MonthFinancialNet = 30 },
            CashSummary = new() { MonthIncome = 70, MonthExpense = 40, MonthFinancialNet = 30 },
            CreditSummary = new() { MonthIncome = 20, MonthExpense = 20, MonthFinancialNet = 0 },
            Accounts = new[]
            {
                new DashboardAccountOverview { AccountId = 1, Name = "Cash", CurrentBalance = 100, ClosingBalance = 999 },
                new DashboardAccountOverview { AccountId = 2, Name = "Credit", IsCredit = true, CreditLimit = 100, NormalOutstanding = 120 },
                new DashboardAccountOverview { AccountId = 3, Name = "Unknown", IsCredit = true, MsiOutstanding = 20 }
            }
        };
        public Task<DashboardOverviewResponse> GetOverviewAsync(int userId, string? month, string timezoneId = "America/Mexico_City")
        {
            Calls++;
            Last = (userId, month, timezoneId);
            return Task.FromResult(Overview);
        }
        public Task<DashboardProjectionResponse> GetProjectionAsync(int userId, int? months, string timezoneId = "America/Mexico_City")
            => throw new NotSupportedException();
    }
}
