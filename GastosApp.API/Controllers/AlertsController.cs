using GastosApp.API.Configuration;
using GastosApp.API.Models.Alerts;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Alerts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Controllers;

/// <summary>
/// Alertas de presupuesto: evaluación manual, historial de entregas y outbox del propio usuario.
/// Los DTO nunca exponen el <c>payload</c> del outbox y los logs nunca incluyen datos financieros.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class AlertsController : ControllerBase
{
    /// <summary>Motivo devuelto por <see cref="IAlertEvaluationService.RetryFailedAsync"/> cuando la fila no existe o no es del usuario.</summary>
    private const string RetryReasonNotFound = "not_found";

    private readonly IAlertEvaluationService _alertService;
    private readonly ICurrentUserService _currentUserService;
    private readonly AlertsOptions _alertsOptions;
    private readonly TelegramOptions _telegramOptions;
    private readonly ILogger<AlertsController> _logger;

    public AlertsController(
        IAlertEvaluationService alertService,
        ICurrentUserService currentUserService,
        IOptions<AlertsOptions> alertsOptions,
        IOptions<TelegramOptions> telegramOptions,
        ILogger<AlertsController> logger)
    {
        _alertService = alertService;
        _currentUserService = currentUserService;
        _alertsOptions = alertsOptions.Value;
        _telegramOptions = telegramOptions.Value;
        _logger = logger;
    }

    [HttpGet("deliveries")]
    public async Task<IActionResult> GetDeliveries([FromQuery] string? period, CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetCurrentUserId();
            var deliveries = await _alertService.ListDeliveriesAsync(userId, period, cancellationToken);
            return Ok(deliveries.Select(MapDelivery));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving alert deliveries");
            return StatusCode(500, new { Message = "An error occurred while retrieving alert deliveries" });
        }
    }

    [HttpGet("outbox")]
    public async Task<IActionResult> GetOutbox([FromQuery] string? status, CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetCurrentUserId();
            var outbox = await _alertService.ListOutboxAsync(userId, status, cancellationToken);
            return Ok(outbox.Select(MapOutbox));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving alert outbox");
            return StatusCode(500, new { Message = "An error occurred while retrieving the alert outbox" });
        }
    }

    /// <summary>
    /// Evaluación manual. Despliegue de un solo usuario: requiere alertas y Telegram habilitados
    /// y que el usuario sea el enlazado al bot. Cualquier otro caso recibe 404 genérico,
    /// sin revelar si las alertas ni Telegram están configurados.
    /// </summary>
    [HttpPost("evaluate")]
    public async Task<IActionResult> Evaluate(CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetCurrentUserId();

            if (!_alertsOptions.Enabled || !_telegramOptions.Enabled || userId != _telegramOptions.AppUserId)
            {
                return NotFound(new { Message = "Not found" });
            }

            var result = await _alertService.EvaluateAsync(userId, cancellationToken);

            _logger.LogInformation(
                "Alert evaluation completed for period {PeriodKey}: {BudgetsEvaluated} budgets, {AlertsCreated} alerts created",
                result.PeriodKey,
                result.BudgetsEvaluated,
                result.AlertsCreated);

            return Ok(MapEvaluation(result));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error evaluating alerts");
            return StatusCode(500, new { Message = "An error occurred while evaluating alerts" });
        }
    }

    /// <summary>Reencola una fila fallida propia. Un id de otro usuario se resuelve como no encontrado.</summary>
    [HttpPost("outbox/{id:int}/retry")]
    public async Task<IActionResult> Retry(int id, CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _alertService.RetryFailedAsync(userId, id, cancellationToken);

            if (!result.Success && result.Reason == RetryReasonNotFound)
            {
                return NotFound(new { Message = $"Alert outbox entry with ID {id} not found" });
            }

            if (!result.Success)
            {
                return BadRequest(new { Message = "Only failed alert outbox entries can be retried." });
            }

            _logger.LogInformation("Alert outbox entry {OutboxId} requeued", result.OutboxId);

            return Ok(MapRetry(result));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrying alert outbox entry with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while retrying the alert outbox entry" });
        }
    }

    private static AlertEvaluationResponse MapEvaluation(AlertEvaluationResult result) => new()
    {
        PeriodKey = result.PeriodKey,
        BudgetsEvaluated = result.BudgetsEvaluated,
        AlertsCreated = result.AlertsCreated
    };

    private static AlertDeliveryResponse MapDelivery(AlertDeliveryListItem item) => new()
    {
        DeliveryId = item.DeliveryId,
        BudgetId = item.BudgetId,
        BudgetName = item.BudgetName,
        ThresholdId = item.ThresholdId,
        ThresholdName = item.ThresholdName,
        PeriodKey = item.PeriodKey,
        ThresholdPercent = item.ThresholdPercent,
        BudgetAmount = item.BudgetAmount,
        SpentAmount = item.SpentAmount,
        PercentUsed = item.PercentUsed,
        CreatedAt = item.CreatedAt,
        OutboxStatus = item.OutboxStatus,
        SentAt = item.SentAt
    };

    private static AlertOutboxResponse MapOutbox(AlertOutboxListItem item) => new()
    {
        OutboxId = item.OutboxId,
        DeliveryId = item.DeliveryId,
        BudgetId = item.BudgetId,
        PeriodKey = item.PeriodKey,
        Channel = item.Channel,
        Status = item.Status,
        Attempts = item.Attempts,
        NextAttemptAt = item.NextAttemptAt,
        SentAt = item.SentAt,
        LastError = item.LastError,
        CreatedAt = item.CreatedAt
    };

    private static AlertRetryResponse MapRetry(AlertRetryResult result) => new()
    {
        OutboxId = result.OutboxId,
        Success = result.Success,
        Reason = result.Reason,
        Status = result.Status,
        Attempts = result.Attempts,
        NextAttemptAt = result.NextAttemptAt
    };

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }
}
