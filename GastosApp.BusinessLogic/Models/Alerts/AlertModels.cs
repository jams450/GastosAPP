namespace GastosApp.BusinessLogic.Models.Alerts
{
    /// <summary>
    /// Resultado de una corrida del evaluador. Solo conteos: nunca montos, descripciones ni payload.
    /// </summary>
    public class AlertEvaluationResult
    {
        public string PeriodKey { get; set; } = string.Empty;
        /// <summary>Presupuestos activos del usuario revisados en el periodo.</summary>
        public int BudgetsEvaluated { get; set; }
        /// <summary>Entregas nuevas reclamadas (y su outbox) en esta corrida.</summary>
        public int AlertsCreated { get; set; }
    }

    /// <summary>Fila de historial de entrega. <b>Sin</b> <c>payload</c> de outbox.</summary>
    public class AlertDeliveryListItem
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
        /// <summary>Estado del outbox asociado, si existe.</summary>
        public string? OutboxStatus { get; set; }
        public DateTimeOffset? SentAt { get; set; }
    }

    /// <summary>Fila de outbox para diagnóstico. <b>Sin</b> <c>payload</c>.</summary>
    public class AlertOutboxListItem
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
    public class AlertRetryResult
    {
        public int OutboxId { get; set; }
        public bool Success { get; set; }
        /// <summary><c>requeued</c>, <c>not_found</c> o <c>not_failed</c>.</summary>
        public string Reason { get; set; } = string.Empty;
        public string? Status { get; set; }
        public int Attempts { get; set; }
        public DateTimeOffset? NextAttemptAt { get; set; }
    }
}
