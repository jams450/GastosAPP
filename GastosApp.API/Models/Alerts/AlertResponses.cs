namespace GastosApp.API.Models.Alerts;

/// <summary>Resultado de una corrida del evaluador. Solo conteos: nunca payload ni texto de alerta.</summary>
public class AlertEvaluationResponse
{
    public string PeriodKey { get; set; } = string.Empty;
    public int BudgetsEvaluated { get; set; }
    public int AlertsCreated { get; set; }
}

/// <summary>
/// Historial de entregas del propio usuario. Expone los snapshots financieros congelados
/// de sus entregas; <b>nunca</b> el <c>payload</c> de outbox.
/// </summary>
public class AlertDeliveryResponse
{
    public int DeliveryId { get; set; }
    public int BudgetId { get; set; }
    public string BudgetName { get; set; } = string.Empty;
    public int ThresholdId { get; set; }
    public string ThresholdName { get; set; } = string.Empty;
    public string PeriodKey { get; set; } = string.Empty;
    public decimal ThresholdPercent { get; set; }
    public decimal BudgetAmount { get; set; }
    public decimal SpentAmount { get; set; }
    public decimal PercentUsed { get; set; }
    public DateTime? CreatedAt { get; set; }
    public string? OutboxStatus { get; set; }
    public DateTimeOffset? SentAt { get; set; }
}

/// <summary>Fila de outbox para diagnóstico del propio usuario. <b>Sin</b> <c>payload</c>.</summary>
public class AlertOutboxResponse
{
    public int OutboxId { get; set; }
    public int DeliveryId { get; set; }
    public int BudgetId { get; set; }
    public string PeriodKey { get; set; } = string.Empty;
    public string Channel { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int Attempts { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public DateTimeOffset? SentAt { get; set; }
    public string? LastError { get; set; }
    public DateTime? CreatedAt { get; set; }
}

/// <summary>Resultado de un reintento manual. <b>Sin</b> <c>payload</c>.</summary>
public class AlertRetryResponse
{
    public int OutboxId { get; set; }
    public bool Success { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string? Status { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset? NextAttemptAt { get; set; }
}
