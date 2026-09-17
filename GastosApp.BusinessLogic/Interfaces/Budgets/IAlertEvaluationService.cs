using GastosApp.BusinessLogic.Models.Alerts;

namespace GastosApp.BusinessLogic.Interfaces
{
    /// <summary>
    /// Evaluación de alertas de presupuesto y lectura/reintento del outbox transaccional.
    /// Todo el alcance es por <c>appUserId</c> recibido explícitamente: nunca se
    /// infiere de claims ni de la petición.
    /// </summary>
    public interface IAlertEvaluationService
    {
        /// <summary>
        /// Evalúa únicamente los presupuestos activos del usuario en el mes actual
        /// (America/Mexico_City). Idempotente: la unicidad de <c>alert_deliveries</c> decide;
        /// si otro evaluador ya reclamó la entrega, no se crea outbox.
        /// </summary>
        Task<AlertEvaluationResult> EvaluateAsync(int appUserId, CancellationToken cancellationToken = default);

        /// <summary>Historial de entregas del usuario; <paramref name="periodKey"/> null = todos los periodos.</summary>
        Task<IReadOnlyList<AlertDeliveryListItem>> ListDeliveriesAsync(int appUserId, string? periodKey = null, CancellationToken cancellationToken = default);

        /// <summary>Outbox del usuario para diagnóstico; <paramref name="status"/> null = todos.</summary>
        Task<IReadOnlyList<AlertOutboxListItem>> ListOutboxAsync(int appUserId, string? status = null, CancellationToken cancellationToken = default);

        /// <summary>Reencola una fila <c>failed</c> del usuario a <c>pending</c> con <c>attempts = 0</c>.</summary>
        Task<AlertRetryResult> RetryFailedAsync(int appUserId, int outboxId, CancellationToken cancellationToken = default);
    }
}
