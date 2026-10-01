using System.Globalization;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Alerts;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>
    /// Evalúa umbrales de presupuesto y materializa el outbox transaccional de alertas.
    /// No envía nada (el dispatcher vive fuera de BusinessLogic) y nunca registra el payload:
    /// es dato financiero que solo viaja a la base de datos.
    /// </summary>
    public class AlertEvaluationService : IAlertEvaluationService
    {
        private readonly IRepository _repository;
        private readonly IBudgetService _budgetService;

        /// <summary>Compartido y nunca mutado: presupuestos sin entregas del periodo.</summary>
        private static readonly HashSet<int> EmptyThresholdIds = new();

        public AlertEvaluationService(IRepository repository, IBudgetService budgetService)
        {
            _repository = repository;
            _budgetService = budgetService;
        }

        public async Task<AlertEvaluationResult> EvaluateAsync(int appUserId, CancellationToken cancellationToken = default)
        {
            var (year, month, _, _) = MonthRangeResolver.ResolveUtcRange(null, null);
            var periodKey = $"{year:D4}-{month:D2}";

            var result = new AlertEvaluationResult { PeriodKey = periodKey };

            var budgets = await _budgetService.ListAsync(appUserId, periodKey);
            var activeBudgets = budgets.Where(b => b.Active).ToList();
            if (activeBudgets.Count == 0)
            {
                return result;
            }

            // El gasto se toma del cálculo existente de BudgetService (misma lógica que /budgets/status).
            var statuses = await _budgetService.GetPeriodStatusAsync(appUserId, periodKey);
            var statusByBudget = statuses.ToDictionary(s => s.BudgetId);

            // Una sola lectura de entregas para todos los presupuestos activos. La garantía de
            // idempotencia sigue siendo el candado atómico del Claim; esto solo evita intentos obvios.
            var activeBudgetIds = activeBudgets.Select(b => b.BudgetId).ToList();
            var deliveries = await _repository
                .Get<AlertDelivery>(d => d.PeriodKey == periodKey && activeBudgetIds.Contains(d.BudgetId))
                .Select(d => new { d.BudgetId, d.ThresholdId })
                .ToListAsync(cancellationToken);

            var deliveredByBudget = deliveries
                .GroupBy(d => d.BudgetId)
                .ToDictionary(g => g.Key, g => g.Select(d => d.ThresholdId).ToHashSet());

            foreach (var budget in activeBudgets)
            {
                cancellationToken.ThrowIfCancellationRequested();
                result.BudgetsEvaluated++;

                if (!statusByBudget.TryGetValue(budget.BudgetId, out var status) ||
                    (status.Spent <= 0m && status.ThresholdPercent <= 0m))
                {
                    continue;
                }

                // El umbral se decide con ThresholdPercent: con Alerts:CommittedCountsEnabled apagado
                // equivale al gasto ejecutado (Fase 2 intacta); con el interruptor encendido incluye el
                // comprometido. El PercentUsed que viaja al payload y a la entrega sigue siendo el
                // desglose mostrado (spentPercent + committedPercent), para que el mensaje lo refleje.
                var thresholdPercent = status.ThresholdPercent;

                // Cruzados activos, de mayor a menor. Solo se elige el porcentaje mayor sin entrega previa.
                var crossed = budget.Thresholds
                    .Where(t => t.Active && t.Percent <= thresholdPercent)
                    .OrderByDescending(t => t.Percent)
                    .ToList();

                if (crossed.Count == 0)
                {
                    continue;
                }

                var delivered = deliveredByBudget.TryGetValue(budget.BudgetId, out var deliveredThresholds)
                    ? deliveredThresholds
                    : EmptyThresholdIds;
                var chosen = crossed.FirstOrDefault(t => !delivered.Contains(t.ThresholdId));
                if (chosen == null)
                {
                    continue;
                }

                var budgetAmount = RoundMoney(budget.AmountMxn);
                var spent = RoundMoney(status.Spent);
                var committed = RoundMoney(status.Committed);
                var chosenPercent = RoundPercent(chosen.Percent);
                var percentUsed = RoundPercent(status.PercentUsed);
                var payload = BuildPayload(budget, chosen, spent, committed, budgetAmount, percentUsed);

                // Una sentencia atómica: ON CONFLICT DO NOTHING sobre (budget, threshold, period) y,
                // solo si ganó el candado, el outbox. Si otro evaluador ya reclamó, no inserta nada.
                var created = await _repository.ExecuteInTransactionAsync(() =>
                    _repository.ClaimAlertDeliveryAsync(
                        budget.BudgetId,
                        chosen.ThresholdId,
                        appUserId,
                        periodKey,
                        chosenPercent,
                        budgetAmount,
                        spent,
                        percentUsed,
                        payload,
                        DateTimeOffset.UtcNow));

                if (created)
                {
                    result.AlertsCreated++;
                }
            }

            return result;
        }

        public async Task<IReadOnlyList<AlertDeliveryListItem>> ListDeliveriesAsync(int appUserId, string? periodKey = null, CancellationToken cancellationToken = default)
        {
            var period = periodKey == null ? null : NormalizePeriodKey(periodKey);

            var query = _repository.Get<AlertDelivery>(d => d.UserId == appUserId);
            if (period != null)
            {
                query = query.Where(d => d.PeriodKey == period);
            }

            return await query
                .OrderByDescending(d => d.Created)
                .ThenByDescending(d => d.DeliveryId)
                .Select(d => new AlertDeliveryListItem
                {
                    DeliveryId = d.DeliveryId,
                    BudgetId = d.BudgetId,
                    BudgetName = d.Budget.Name,
                    ThresholdId = d.ThresholdId,
                    ThresholdName = d.Threshold.Name,
                    PeriodKey = d.PeriodKey,
                    ThresholdPercent = d.ThresholdPercent,
                    BudgetAmount = d.BudgetAmount,
                    SpentAmount = d.SpentAmount,
                    PercentUsed = d.PercentUsed,
                    CreatedAt = d.Created,
                    OutboxStatus = d.Outbox == null ? null : d.Outbox.Status,
                    SentAt = d.Outbox == null ? null : d.Outbox.SentAt
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<IReadOnlyList<AlertOutboxListItem>> ListOutboxAsync(int appUserId, string? status = null, CancellationToken cancellationToken = default)
        {
            var normalizedStatus = status == null ? null : NormalizeStatus(status);

            // El outbox tiene dueño propio. El alcance por Delivery.UserId ya no sirve: las filas de
            // partida y de ejecución automática no tienen entrega, y tolerar Delivery == null en un OR
            // no acota nada (devolvería el payload de todos los usuarios). Por eso se filtra por UserId.
            var query = _repository.Get<AlertOutbox>(o => o.UserId == appUserId);
            if (normalizedStatus != null)
            {
                query = query.Where(o => o.Status == normalizedStatus);
            }

            return await query
                .OrderBy(o => o.Status)
                .ThenByDescending(o => o.OutboxId)
                .Select(o => new AlertOutboxListItem
                {
                    OutboxId = o.OutboxId,
                    DeliveryId = o.DeliveryId,
                    BudgetId = o.Delivery != null ? o.Delivery.BudgetId : null,
                    PeriodKey = o.Delivery != null ? o.Delivery.PeriodKey : null,
                    Channel = o.Channel,
                    Status = o.Status,
                    Attempts = o.Attempts,
                    NextAttemptAt = o.NextAttemptAt,
                    SentAt = o.SentAt,
                    LastError = o.LastError,
                    CreatedAt = o.Created
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<AlertRetryResult> RetryFailedAsync(int appUserId, int outboxId, CancellationToken cancellationToken = default)
        {
            // Mismo alcance que ListOutboxAsync: igualdad por dueño propio. Un OR que tolerara
            // Delivery == null permitiría reencolar el aviso de otro usuario.
            var outbox = await _repository.GetTrack<AlertOutbox>()
                .FirstOrDefaultAsync(
                    o => o.OutboxId == outboxId && o.UserId == appUserId,
                    cancellationToken);

            if (outbox == null)
            {
                return new AlertRetryResult { OutboxId = outboxId, Success = false, Reason = "not_found" };
            }

            if (!string.Equals(outbox.Status, AlertOutboxStatus.Failed, StringComparison.Ordinal))
            {
                return new AlertRetryResult
                {
                    OutboxId = outboxId,
                    Success = false,
                    Reason = "not_failed",
                    Status = outbox.Status,
                    Attempts = outbox.Attempts,
                    NextAttemptAt = outbox.NextAttemptAt
                };
            }

            outbox.Status = AlertOutboxStatus.Pending;
            outbox.Attempts = 0;
            outbox.LastError = null;
            outbox.NextAttemptAt = DateTimeOffset.UtcNow;
            await _repository.SaveChangesAsync();

            return new AlertRetryResult
            {
                OutboxId = outbox.OutboxId,
                Success = true,
                Reason = "requeued",
                Status = outbox.Status,
                Attempts = outbox.Attempts,
                NextAttemptAt = outbox.NextAttemptAt
            };
        }

        /// <summary>
        /// Texto estable en español; sin secretos, sin logs. Se congela al crear la entrega.
        /// Las líneas de comprometido y total solo aparecen cuando hay comprometido: sin partidas que
        /// lo alimenten, el mensaje es idéntico al de Fase 2 (cero montos por partida).
        /// </summary>
        private static string BuildPayload(Budget budget, BudgetThreshold threshold, decimal spent, decimal committed, decimal amount, decimal percentUsed)
        {
            var thresholdPercent = RoundPercent(threshold.Percent);
            var effective = RoundMoney(spent + committed);
            var remaining = RoundMoney(amount - effective);

            var header = string.Create(CultureInfo.InvariantCulture, $"""
                Presupuesto "{budget.Name}" · {budget.PeriodKey}
                Gastado: ${spent:N2} de ${amount:N2} ({RoundPercent(spent / amount * 100m):F2}%)
                """);

            var committedLine = committed > 0m
                ? string.Create(CultureInfo.InvariantCulture, $"\nComprometido: ${committed:N2} ({RoundPercent(committed / amount * 100m):F2}%)\nTotal: ${effective:N2} ({percentUsed:F2}%)")
                : string.Empty;

            var footer = string.Create(CultureInfo.InvariantCulture, $"""

                Umbral alcanzado: {threshold.Name} ({thresholdPercent:F2}%)
                Restante: ${remaining:N2}
                """);

            return header + committedLine + footer;
        }

        private static string NormalizePeriodKey(string periodKey)
        {
            if (string.IsNullOrWhiteSpace(periodKey) ||
                !DateTime.TryParseExact(periodKey, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            {
                throw new ArgumentException("periodKey must use yyyy-MM format.", nameof(periodKey));
            }

            return periodKey;
        }

        private static string NormalizeStatus(string status)
        {
            var normalized = status.Trim().ToLowerInvariant();
            if (normalized != AlertOutboxStatus.Pending &&
                normalized != AlertOutboxStatus.Sent &&
                normalized != AlertOutboxStatus.Failed)
            {
                throw new ArgumentException("status must be one of: pending, sent, failed.", nameof(status));
            }

            return normalized;
        }

        private static decimal RoundMoney(decimal value) =>
            Math.Round(value, 2, MidpointRounding.AwayFromZero);

        private static decimal RoundPercent(decimal value) =>
            Math.Round(value, 2, MidpointRounding.AwayFromZero);
    }
}
