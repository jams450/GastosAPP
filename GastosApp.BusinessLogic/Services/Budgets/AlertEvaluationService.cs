using System.Globalization;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Alerts;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>
    /// Evalúa umbrales de presupuesto y alertas de partida planificada, y materializa el outbox
    /// transaccional de ambas. No envía nada (el dispatcher vive fuera de BusinessLogic) y nunca
    /// registra el payload: es dato financiero que solo viaja a la base de datos.
    /// </summary>
    public class AlertEvaluationService : IAlertEvaluationService
    {
        private readonly IRepository _repository;
        private readonly IBudgetService _budgetService;
        private readonly BudgetEvaluationSettings _settings;
        private readonly ILogger<AlertEvaluationService> _logger;

        /// <summary>Compartido y nunca mutado: presupuestos sin entregas del periodo.</summary>
        private static readonly HashSet<int> EmptyThresholdIds = new();

        public AlertEvaluationService(
            IRepository repository,
            IBudgetService budgetService,
            BudgetEvaluationSettings settings,
            ILogger<AlertEvaluationService> logger)
        {
            _repository = repository;
            _budgetService = budgetService;
            _settings = settings;
            _logger = logger;
        }

        public async Task<AlertEvaluationResult> EvaluateAsync(int appUserId, CancellationToken cancellationToken = default)
        {
            var (year, month, _, _) = MonthRangeResolver.ResolveUtcRange(null, null);
            var periodKey = $"{year:D4}-{month:D2}";

            var result = new AlertEvaluationResult { PeriodKey = periodKey };

            // Orden deliberado: primero los umbrales (camino de Fase 2, el que puede facturar) y
            // después la cobertura de partidas. Así una falla en las partidas no puede impedir una
            // evaluación de umbrales, y además EvaluatePlannedItemsAsync se traga su propia falla.
            await EvaluateThresholdsAsync(appUserId, periodKey, result, cancellationToken);
            await EvaluatePlannedItemsAsync(appUserId, periodKey, result, cancellationToken);

            return result;
        }

        private async Task EvaluateThresholdsAsync(
            int appUserId,
            string periodKey,
            AlertEvaluationResult result,
            CancellationToken cancellationToken)
        {
            var budgets = await _budgetService.ListAsync(appUserId, periodKey);
            var activeBudgets = budgets.Where(b => b.Active).ToList();
            if (activeBudgets.Count == 0)
            {
                return;
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
        }

        /// <summary>
        /// Cobertura de partidas planificadas (plan §6): recorre las partidas <c>pending</c> del
        /// periodo vigente del usuario y encola las alertas que le tocan. Solo <b>lee</b> las
        /// partidas —nunca escribe sobre ellas— y no envía nada: el drenador genérico de Fase 2 ya
        /// despacha lo que queda <c>pending</c> en el outbox (regla 2 de §6.4: generalizar, no
        /// duplicar el drenador).
        /// </summary>
        private async Task EvaluatePlannedItemsAsync(
            int appUserId,
            string periodKey,
            AlertEvaluationResult result,
            CancellationToken cancellationToken)
        {
            // Interruptor de despliegue (plan §6.4 regla 4: "las alertas de partida nacen apagadas").
            // Apaga la evaluación de partidas COMPLETA —las tres alertas—, no solo el cierre de mes:
            // §6.2 mete a due_today, overdue y unexecuted_month_end detrás de esta misma clave, y el
            // nombre es el que manda (§6.4 la fija literal) mientras que el alcance lo fija §6.2.
            //
            // El corte va aquí, antes de la consulta: con el interruptor en false no se lee una sola
            // partida ni se intenta un reclamo, así que un despliegue existente no puede empezar a
            // recibir alertas nuevas sin tocar configuración —que es exactamente lo que el plan
            // prohíbe entregar—. El nombre de la propiedad es histórico; su alcance no lo es.
            if (!_settings.UnexecutedAlertEnabled)
            {
                return;
            }

            // "Hoy" y "último día del mes" salen del reloj local de America/Mexico_City, nunca del UTC
            // crudo: el contenedor corre en UTC y el día local puede diferir en horas.
            var today = DateOnly.FromDateTime(MonthRangeResolver.ResolveLocalDate(DateTime.UtcNow));
            var isLastDayOfMonth = today.Day == DateTime.DaysInMonth(today.Year, today.Month);

            // Aislamiento: las alertas de partida son cobertura adicional sobre el camino principal.
            // Una falla aquí (base de datos, permiso, índice) no puede tumbar el worker ni impedir la
            // evaluación de umbrales, que ya se resolvió antes. Solo el tipo en el log: nunca payload,
            // montos ni nombres (plan §7).
            try
            {
                // El filtro de estado es el que excluye a executed/ignored/cancelled: ninguna de las
                // tres alertas existe para ellas. El de periodo es el mismo corte que
                // BudgetItemAlertTrigger aplica a "dentro del mes" del overdue —allí para que la
                // regla no dependa de este recorrido, aquí para no traer filas que no pueden
                // disparar— y el de usuario fija el alcance single-user explícito (§6.4 regla 3).
                var items = await _repository
                    .Get<BudgetItem>(i => i.UserId == appUserId &&
                                          i.PeriodKey == periodKey &&
                                          i.Status == BudgetItemStatus.Pending)
                    .ToListAsync(cancellationToken);

                foreach (var item in items)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    result.ItemsEvaluated++;

                    var plannedDate = DateOnly.FromDateTime(item.PlannedDate);
                    var amount = RoundMoney(item.PlannedAmount);

                    // Sin filtro por kind ni por auto_execute: una plantilla sin auto-ejecución es
                    // precisamente la que más necesita el aviso (§6.2 y §6.3). El periodo viaja
                    // explícito para que el trigger no lo aduzca desde la fecha.
                    foreach (var alertKind in BudgetItemAlertTrigger.ResolveKinds(
                                 plannedDate,
                                 today,
                                 periodKey,
                                 isLastDayOfMonth))
                    {
                        var payload = BudgetItemAlertTrigger.BuildPayload(alertKind, item.Name, amount);
                        var queued = await TryClaimItemAlertAsync(item, appUserId, periodKey, alertKind, amount, payload);

                        if (queued)
                        {
                            result.ItemAlertsCreated++;
                        }
                    }
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception exception)
            {
                // Solo el tipo: nunca montos, payload ni mensaje de excepción.
                _logger.LogError("Planned-item alert evaluation failed: {ErrorType}", exception.GetType().Name);
            }
        }

        /// <summary>
        /// Reclamo de un aviso de partida. Una partida que falla no debe quitarle el aviso a las
        /// demás, así que la falla se aísla por partida (mismo criterio que el motor de programados).
        /// La idempotencia no depende de este <c>try</c>: la ganancia del candado la decide
        /// <c>ON CONFLICT DO NOTHING</c> sobre <c>(item_id, alert_kind, period_key)</c>, así que
        /// repetir la evaluación —o reintentar el despacho— no duplica nada.
        /// </summary>
        private async Task<bool> TryClaimItemAlertAsync(
            BudgetItem item,
            int appUserId,
            string periodKey,
            string alertKind,
            decimal amount,
            string payload)
        {
            try
            {
                return await _repository.ClaimBudgetItemAlertAsync(
                    item.ItemId,
                    appUserId,
                    periodKey,
                    alertKind,
                    amount,
                    payload,
                    DateTimeOffset.UtcNow);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // Solo el tipo y el id de la partida: nunca el payload ni el monto.
                _logger.LogError(
                    "Planned-item alert claim failed for item {ItemId} ({ErrorType})",
                    item.ItemId,
                    exception.GetType().Name);
                return false;
            }
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
        /// <remarks>
        /// El relleno de espacios de <c>Gastado:</c>, <c>Total:</c> y <c>Restante:</c> no es
        /// decorativo: reproduce línea por línea el bloque literal de §5, donde los valores quedan
        /// alineados en columna. <c>Comprometido:</c> lleva un solo espacio porque es la línea más
        /// larga de la etiqueta y no tiene con qué alinearse. El texto es contrato con el usuario:
        /// cambiar un espacio es un cambio de payload, no un refactor.
        /// </remarks>
        private static string BuildPayload(Budget budget, BudgetThreshold threshold, decimal spent, decimal committed, decimal amount, decimal percentUsed)
        {
            var thresholdPercent = RoundPercent(threshold.Percent);
            var effective = RoundMoney(spent + committed);
            var remaining = RoundMoney(amount - effective);

            var header = string.Create(CultureInfo.InvariantCulture, $"""
                Presupuesto "{budget.Name}" · {budget.PeriodKey}
                Gastado:   ${spent:N2} de ${amount:N2} ({RoundPercent(spent / amount * 100m):F2}%)
                """);

            var committedLine = committed > 0m
                ? string.Create(CultureInfo.InvariantCulture, $"\nComprometido: ${committed:N2} ({RoundPercent(committed / amount * 100m):F2}%)\nTotal:     ${effective:N2} ({percentUsed:F2}%)")
                : string.Empty;

            var footer = string.Create(CultureInfo.InvariantCulture, $"""

                Umbral alcanzado: {threshold.Name} ({thresholdPercent:F2}%)
                Restante:  ${remaining:N2}
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
