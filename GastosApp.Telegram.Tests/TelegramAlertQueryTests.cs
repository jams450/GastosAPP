using GastosApp.API.Services.Telegram;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Alerts;
using GastosApp.BusinessLogic.Services;
using Microsoft.Extensions.AI;

internal static class TelegramAlertQueryTests
{
    public static async Task RunAsync()
    {
        var alerts = new FakeTelegramAlertService();
        var service = new TelegramToolService(null!, null!, null!, null!, null!, null!, null!, new FakeTelegramBudgetService(), alerts);
        var created = new DateTime(2026, 9, 8, 6, 0, 0, DateTimeKind.Utc);
        var sentAt = new DateTimeOffset(created);
        alerts.Results = new[]
        {
            new AlertDeliveryListItem
            {
                DeliveryId = 1, BudgetId = 2, BudgetName = "Budget", ThresholdId = 3, ThresholdName = "Warning",
                PeriodKey = "2026-09", ThresholdPercent = 81, BudgetAmount = 101, SpentAmount = 102,
                PercentUsed = 103, CreatedAt = created, OutboxStatus = "sent", SentAt = null
            },
            new AlertDeliveryListItem { DeliveryId = 2, CreatedAt = created, OutboxStatus = "pending", SentAt = sentAt },
            new AlertDeliveryListItem { DeliveryId = 3, CreatedAt = created.AddDays(1), OutboxStatus = "failed", SentAt = sentAt },
            new AlertDeliveryListItem { DeliveryId = 4, OutboxStatus = null, SentAt = sentAt },
            new AlertDeliveryListItem { DeliveryId = 5, OutboxStatus = "sending", SentAt = sentAt },
            new AlertDeliveryListItem { DeliveryId = 6, OutboxStatus = "sent", SentAt = sentAt }
        };
        using var tokenSource = new CancellationTokenSource();
        var result = (TelegramAlertResponse)await service.AlertasPresupuestoAsync(new("2026-09"), 75, tokenSource.Token);
        Check(alerts.Last == (75, "2026-09", tokenSource.Token), "Alert user period and token forwarded");
        Check(result.Month == "2026-09" && result.Timezone == "America/Mexico_City", "Alert period metadata");
        Check(result.TotalDeliveries == 6 && result.SentCount == 2 && result.PendingCount == 1 &&
            result.FailedCount == 1 && result.UnknownStatusCount == 2 && !result.Truncated, "Raw status counts");
        var row = result.Deliveries.Single(x => x.DeliveryId == 1);
        Check(row.BudgetId == 2 && row.BudgetName == "Budget" && row.ThresholdId == 3 && row.ThresholdName == "Warning" &&
            row.PeriodKey == "2026-09" && row.ThresholdPercent == 81 && row.BudgetAmount == 101 &&
            row.SpentAmount == 102 && row.PercentUsed == 103 && row.CreatedAt == created, "Exact payload-free mapping");
        Check(row.Sent && row.SentAt is null && row.OutboxStatus == "sent", "Sent status without timestamp remains sent");
        Check(result.Deliveries.Where(x => x.DeliveryId is >= 2 and <= 5).All(x => !x.Sent && x.SentAt == sentAt),
            "Timestamp alone never proves sent");
        Check(result.Deliveries.Single(x => x.DeliveryId == 4).OutboxStatus is null &&
            result.Deliveries.Single(x => x.DeliveryId == 5).OutboxStatus == "sending", "Null and unknown status preserved");
        Check(result.Deliveries.Select(x => x.DeliveryId).SequenceEqual(new[] { 3, 2, 1, 6, 5, 4 }), "Created and ID descending ordering");
        foreach (var month in new[] { "", "bad", "2026-13", "2026-9", "0000-01", " " })
        {
            var calls = alerts.Calls;
            Check(await service.AlertasPresupuestoAsync(new(month), 75, default) is TelegramToolService.ToolError && alerts.Calls == calls,
                "Invalid alert month skips service");
        }
        await service.AlertasPresupuestoAsync(new(), 75, default);
        Check(alerts.Last.Month == MonthRangeResolver.CurrentPeriodKey("America/Mexico_City"), "Default alert Mexico month");
        alerts.Results = Enumerable.Range(1, 55).Select(id => new AlertDeliveryListItem
        {
            DeliveryId = id, CreatedAt = created, OutboxStatus = id <= 50 ? "sent" : id == 51 ? "pending" : id == 52 ? "failed" : null
        }).ToList();
        result = (TelegramAlertResponse)await service.AlertasPresupuestoAsync(new(), 75, default);
        Check(result.TotalDeliveries == 55 && result.SentCount == 50 && result.PendingCount == 1 && result.FailedCount == 1 &&
            result.UnknownStatusCount == 3 && result.Truncated && result.Deliveries.Count == 50, "Full counts before detail cap");
        Check(result.Deliveries.First().DeliveryId == 55 && result.Deliveries.Last().DeliveryId == 6, "Sorting before cap");
        alerts.Results = [];
        result = (TelegramAlertResponse)await service.AlertasPresupuestoAsync(new(), 75, default);
        Check(result.TotalDeliveries == 0 && result.SentCount == 0 && result.PendingCount == 0 && result.FailedCount == 0 &&
            result.UnknownStatusCount == 0 && !result.Truncated && result.Deliveries.Count == 0, "Empty scoped history");
        Check(result.HistoryScope.Contains("umbrales") && result.HistoryScope.Contains("no prueba ausencia global") &&
            result.HistoryScope.Contains("no significa leído"), "Empty result preserves scope and receipt disclaimer");
        using var before = new CancellationTokenSource();
        before.Cancel();
        var beforeCalls = alerts.Calls;
        await ExpectCancellationAsync(() => service.AlertasPresupuestoAsync(new(), 75, before.Token));
        Check(alerts.Calls == beforeCalls, "Pre-cancel skips alert service");
        using var after = new CancellationTokenSource();
        alerts.AfterRead = after.Cancel;
        await ExpectCancellationAsync(() => service.AlertasPresupuestoAsync(new(), 75, after.Token));
        Check(alerts.Calls == beforeCalls + 1 && alerts.Last.Token == after.Token, "Post-read cancellation and token propagation");
        alerts.AfterRead = null;
        var function = ExpenseAgentService.CreateFinancialTools(service, 94, default).Single(x => x.Name == "alertas_presupuesto");
        var schema = function.JsonSchema.ToString();
        Check(!schema.Contains("userId", StringComparison.OrdinalIgnoreCase) && !schema.Contains("scope", StringComparison.OrdinalIgnoreCase),
            "Alert schema is month-only, identity hidden");
        await function.InvokeAsync(new AIFunctionArguments { ["request"] = new TelegramAlertRequest("2026-09") });
        Check(alerts.Last.UserId == 94 && alerts.Last.Month == "2026-09", "Actual alert function captures identity");
        Console.WriteLine("PASS Telegram threshold alert history (offline statuses, counts, scope and registration)");
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
            throw new Exception("Alert cancellation not propagated");
        }
        catch (OperationCanceledException) { }
    }
}

internal sealed class FakeTelegramAlertService : IAlertEvaluationService
{
    public IReadOnlyList<AlertDeliveryListItem> Results { get; set; } = [];
    public (int UserId, string? Month, CancellationToken Token) Last { get; private set; }
    public int Calls { get; private set; }
    public Action? AfterRead { get; set; }
    public Task<IReadOnlyList<AlertDeliveryListItem>> ListDeliveriesAsync(int appUserId, string? periodKey = null, CancellationToken cancellationToken = default)
    {
        Calls++;
        Last = (appUserId, periodKey, cancellationToken);
        AfterRead?.Invoke();
        return Task.FromResult(Results);
    }
    public Task<AlertEvaluationResult> EvaluateAsync(int appUserId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<IReadOnlyList<AlertOutboxListItem>> ListOutboxAsync(int appUserId, string? status = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<AlertRetryResult> RetryFailedAsync(int appUserId, int outboxId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
}
