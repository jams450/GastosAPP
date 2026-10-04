using GastosApp.API.Services.Telegram;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.BusinessLogic.Services;
using GastosApp.Models.Entities;
using Microsoft.Extensions.AI;

internal static class TelegramBudgetQueryTests
{
    public static async Task RunAsync()
    {
        var budgets = new FakeTelegramBudgetService();
        var service = new TelegramToolService(null!, null!, null!, null!, null!, null!, null!, budgets, new FakeTelegramAlertService());
        budgets.Results = new[]
        {
            new BudgetStatusResult
            {
                BudgetId = 2, Name = "Inactive", PeriodKey = "2026-09", Active = false, CategoryId = 7,
                AmountMxn = 101, Spent = 102, SpentPercent = 103, Committed = 104, CommittedPercent = 105,
                Projected = 106, ProjectedPercent = 107, Effective = 108, Forecast = 109, PercentUsed = 110,
                ThresholdPercent = 111, Remaining = -112, PlannedAmount = 113, Variance = 114,
                ItemsPending = 115, ItemsExecuted = 116, ItemsIgnored = 117, PlannedIncome = 118,
                CommittedIncome = 119, ProjectedIncome = 120, Status = "exceeded",
                ReachedThreshold = new() { ThresholdId = 8, Name = "Limit", Percent = 121 }
            },
            new BudgetStatusResult { BudgetId = 1, Name = "Active", Active = true, SubcategoryId = 9 }
        };
        var result = (TelegramBudgetResponse)await service.PresupuestosAsync(new("2026-09"), 74, default);
        Check(budgets.Last == (74, "2026-09"), "Budget identity and validated month");
        Check(result.Month == "2026-09" && result.Timezone == "America/Mexico_City", "Budget period metadata");
        Check(result.TotalBudgets == 2 && result.ActiveBudgets == 1 && !result.Truncated, "Includes inactive budgets");
        var inactive = result.Budgets.Single(x => x.BudgetId == 2);
        Check(inactive.Name == "Inactive" && inactive.PeriodKey == "2026-09" && !inactive.Active &&
            inactive.CategoryId == 7 && inactive.SubcategoryId is null, "Budget identity and category mapping");
        Check(inactive.AmountMxn == 101 && inactive.Spent == 102 && inactive.SpentPercent == 103 &&
            inactive.Committed == 104 && inactive.CommittedPercent == 105 && inactive.Projected == 106 &&
            inactive.ProjectedPercent == 107 && inactive.Effective == 108 && inactive.Forecast == 109,
            "Consumption values copied without recalculation");
        Check(inactive.PercentUsed == 110 && inactive.ThresholdPercent == 111 && inactive.Remaining == -112 &&
            inactive.PlannedAmount == 113 && inactive.Variance == 114, "Threshold basis and negative remaining preserved");
        Check(inactive.ItemsPending == 115 && inactive.ItemsExecuted == 116 && inactive.ItemsIgnored == 117 &&
            inactive.PlannedIncome == 118 && inactive.CommittedIncome == 119 && inactive.ProjectedIncome == 120,
            "Plan counts and income mapping");
        Check(inactive.Status == "exceeded" && inactive.ReachedThreshold is { ThresholdId: 8, Name: "Limit", Percent: 121 },
            "Reached threshold copied, not inferred");
        Check(result.Budgets[0].BudgetId == 1 && result.Budgets[0].SubcategoryId == 9 &&
            result.Budgets[0].ReachedThreshold is null, "Stable ordering, subcategory and null threshold");
        foreach (var month in new[] { "", "bad", "2026-13", "2026-9", "0000-01", " " })
        {
            var calls = budgets.Calls;
            Check(await service.PresupuestosAsync(new(month), 74, default) is TelegramToolService.ToolError && budgets.Calls == calls,
                "Invalid budget month skips service");
        }
        var beforeInvalid = budgets.Calls;
        Check(await service.PresupuestosAsync(new(null, "invalid"), 74, default) is TelegramToolService.ToolError &&
            budgets.Calls == beforeInvalid, "Shared scope validator");
        await service.PresupuestosAsync(new(), 74, default);
        Check(budgets.Last.Month == MonthRangeResolver.CurrentPeriodKey("America/Mexico_City"), "Current Mexico period default");
        budgets.Results = Enumerable.Range(1, 55).Select(id => new BudgetStatusResult { BudgetId = id, Active = id > 50 }).ToList();
        result = (TelegramBudgetResponse)await service.PresupuestosAsync(new(), 74, default);
        Check(result.TotalBudgets == 55 && result.ActiveBudgets == 5 && result.Truncated && result.Budgets.Count == 50,
            "Counts before cap, including active budgets outside detail");
        budgets.Results = [];
        result = (TelegramBudgetResponse)await service.PresupuestosAsync(new(), 74, default);
        Check(result.TotalBudgets == 0 && result.ActiveBudgets == 0 && !result.Truncated && result.Budgets.Count == 0, "Empty budget period");
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var beforeCancel = budgets.Calls;
        await ExpectCancellationAsync(() => service.PresupuestosAsync(new(), 74, cancellation.Token));
        Check(budgets.Calls == beforeCancel, "Pre-cancel skips budget service");
        using var after = new CancellationTokenSource();
        budgets.AfterRead = after.Cancel;
        await ExpectCancellationAsync(() => service.PresupuestosAsync(new(), 74, after.Token));
        Check(budgets.Calls == beforeCancel + 1, "Cancellation checked after read");
        budgets.AfterRead = null;
        var function = ExpenseAgentService.CreateFinancialTools(service, 93, default).Single(x => x.Name == "presupuestos");
        Check(!function.JsonSchema.ToString().Contains("userId", StringComparison.OrdinalIgnoreCase), "Budget schema hides identity");
        await function.InvokeAsync(new AIFunctionArguments { ["request"] = new TelegramFinancialRequest("2026-09") });
        Check(budgets.Last == (93, "2026-09"), "Actual budget function captures identity");
        Console.WriteLine("PASS Telegram budget queries (offline exact status mapping, counts and registration)");
    }

    private static void Check(bool condition, string name)
    {
        if (!condition) throw new Exception(name);
    }

    private static async Task ExpectCancellationAsync(Func<Task<object>> action)
    {
        try
        {
            await action();
            throw new Exception("Budget cancellation not propagated");
        }
        catch (OperationCanceledException) { }
    }
}

internal sealed class FakeTelegramBudgetService : IBudgetService
{
    public IReadOnlyList<BudgetStatusResult> Results { get; set; } = [];
    public (int UserId, string? Month) Last { get; private set; }
    public int Calls { get; private set; }
    public Action? AfterRead { get; set; }
    public Task<IReadOnlyList<BudgetStatusResult>> GetPeriodStatusAsync(int userId, string? periodKey = null)
    {
        Calls++;
        Last = (userId, periodKey);
        AfterRead?.Invoke();
        return Task.FromResult(Results);
    }
    public Task<IReadOnlyList<Budget>> ListAsync(int userId, string? periodKey = null) => throw new NotSupportedException();
    public Task<Budget?> GetAsync(int id, int userId) => throw new NotSupportedException();
    public Task<Budget> CreateAsync(int userId, BudgetWriteInput input) => throw new NotSupportedException();
    public Task<Budget?> UpdateAsync(int id, int userId, BudgetWriteInput input) => throw new NotSupportedException();
    public Task<bool> SetActiveAsync(int id, int userId, bool active) => throw new NotSupportedException();
    public Task<Budget?> ReplaceThresholdsAsync(int id, int userId, IReadOnlyList<BudgetThresholdInput> thresholds) => throw new NotSupportedException();
    public Task<BudgetStatusResult?> GetStatusAsync(int id, int userId) => throw new NotSupportedException();
}
