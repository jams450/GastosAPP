using GastosApp.API.Models.Budgets;
using GastosApp.BusinessLogic.Exceptions;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class BudgetsController : ControllerBase
{
    private readonly IBudgetService _budgetService;
    private readonly IRecurringItemService _recurringItemService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<BudgetsController> _logger;

    public BudgetsController(
        IBudgetService budgetService,
        IRecurringItemService recurringItemService,
        ICurrentUserService currentUserService,
        ILogger<BudgetsController> logger)
    {
        _budgetService = budgetService;
        _recurringItemService = recurringItemService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? period)
    {
        try
        {
            var userId = GetCurrentUserId();
            var budgets = await _budgetService.ListAsync(userId, period);
            return Ok(budgets.Select(MapBudget));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving budgets");
            return StatusCode(500, new { Message = "An error occurred while retrieving budgets" });
        }
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus([FromQuery] string? period)
    {
        try
        {
            var userId = GetCurrentUserId();
            var statuses = await _budgetService.GetPeriodStatusAsync(userId, period);
            return Ok(statuses.Select(MapStatus));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving budget statuses");
            return StatusCode(500, new { Message = "An error occurred while retrieving budget statuses" });
        }
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var budget = await _budgetService.GetAsync(id, userId);
            if (budget == null)
            {
                return NotFound(new { Message = $"Budget with ID {id} not found" });
            }

            return Ok(MapBudget(budget));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving budget with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while retrieving the budget" });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] BudgetCreateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();

            var input = new BudgetWriteInput
            {
                PeriodKey = request.PeriodKey,
                Name = request.Name ?? string.Empty,
                CategoryId = request.CategoryId,
                SubcategoryId = request.SubcategoryId,
                AmountMxn = request.AmountMxn,
                Thresholds = request.Thresholds?.Select(MapThresholdInput).ToList()
            };

            var created = await _budgetService.CreateAsync(userId, input);

            // CreateAsync siempre nace activo; el contrato API permite alta inactiva.
            if (!request.Active && await _budgetService.SetActiveAsync(created.BudgetId, userId, false))
            {
                created.Active = false;
            }

            _logger.LogInformation("Budget created successfully: {BudgetId}", created.BudgetId);

            return CreatedAtAction(nameof(GetById), new { id = created.BudgetId }, MapBudget(created));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating budget");
            return StatusCode(500, new { Message = "An error occurred while creating the budget" });
        }
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] BudgetUpdateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();

            var input = new BudgetWriteInput
            {
                Name = request.Name ?? string.Empty,
                CategoryId = request.CategoryId,
                SubcategoryId = request.SubcategoryId,
                AmountMxn = request.AmountMxn
            };

            var updated = await _budgetService.UpdateAsync(id, userId, input);
            if (updated == null)
            {
                return NotFound(new { Message = $"Budget with ID {id} not found" });
            }

            // UpdateAsync no toca Active; se sincroniza si el cliente lo cambió.
            if (updated.Active != request.Active &&
                await _budgetService.SetActiveAsync(id, userId, request.Active))
            {
                updated.Active = request.Active;
            }

            _logger.LogInformation("Budget updated successfully: {BudgetId}", id);

            return Ok(MapBudget(updated));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating budget with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating the budget" });
        }
    }

    [HttpPatch("{id:int}/active")]
    public async Task<IActionResult> UpdateActiveStatus(int id, [FromBody] bool active)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _budgetService.SetActiveAsync(id, userId, active);
            if (!result)
            {
                return NotFound(new { Message = $"Budget with ID {id} not found" });
            }

            _logger.LogInformation("Budget {Id} active status updated to {Active}", id, active);
            return Ok(new { Message = $"Budget active status updated to {active}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating active status for budget with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating the budget status" });
        }
    }

    [HttpPut("{id:int}/thresholds")]
    public async Task<IActionResult> ReplaceThresholds(int id, [FromBody] List<BudgetThresholdRequest>? thresholds)
    {
        try
        {
            var userId = GetCurrentUserId();
            var input = thresholds?.Select(MapThresholdInput).ToList()
                ?? throw new ArgumentException("Thresholds collection is required.");

            var updated = await _budgetService.ReplaceThresholdsAsync(id, userId, input);
            if (updated == null)
            {
                return NotFound(new { Message = $"Budget with ID {id} not found" });
            }

            _logger.LogInformation("Budget {Id} thresholds replaced", id);

            return Ok(MapBudget(updated));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error replacing thresholds for budget with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating the budget thresholds" });
        }
    }

    /// <summary>
    /// Rollover de plan entre dos periodos: clona presupuestos y materializa partidas según el modo.
    /// Idempotente y con <c>dryRun</c> por default: sin confirmación explícita no escribe nada y no
    /// puede sobrescribir un mes existente.
    /// </summary>
    /// <remarks>
    /// La ruta vive aquí por coherencia con <c>api/budgets</c>, pero el trabajo lo hace
    /// <see cref="IRecurringItemService"/>: es el servicio que ya es dueño de la materialización de
    /// partidas y de la clave <c>(user, periodo, kind, nombre)</c> que hace idempotente el remonte.
    /// </remarks>
    [HttpPost("rollover")]
    public async Task<IActionResult> Rollover([FromBody] BudgetRolloverRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();

            var result = await _recurringItemService.RolloverAsync(userId, new BudgetRolloverInput
            {
                FromPeriod = request.FromPeriod,
                ToPeriod = request.ToPeriod,
                Mode = request.Mode,
                DryRun = request.DryRun
            });

            // Solo conteos por bloque: nunca montos, nombres ni payload.
            _logger.LogInformation(
                "Budget rollover {FromPeriod} -> {ToPeriod} ({Mode}, dryRun={DryRun}): budgets={BudgetsInserted}, manual={ManualInserted}, remounted={RemountedInserted}",
                result.FromPeriod,
                result.ToPeriod,
                result.Mode,
                result.DryRun,
                result.Budgets.Inserted,
                result.ManualItems.Inserted,
                result.RemountedItems.Inserted);

            return Ok(MapRollover(result));
        }
        catch (BudgetConflictException ex)
        {
            return Conflict(new { Message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error rolling over budget plan");
            return StatusCode(500, new { Message = "An error occurred while rolling over the budget plan" });
        }
    }

    private static BudgetRolloverResponse MapRollover(BudgetRolloverResult result) => new()
    {
        FromPeriod = result.FromPeriod,
        ToPeriod = result.ToPeriod,
        Mode = result.Mode,
        DryRun = result.DryRun,
        Budgets = MapRolloverCounts(result.Budgets),
        ManualItems = MapRolloverCounts(result.ManualItems),
        RemountedItems = MapRolloverCounts(result.RemountedItems)
    };

    private static BudgetRolloverCountsResponse MapRolloverCounts(BudgetRolloverCounts counts) => new()
    {
        Attempted = counts.Attempted,
        Inserted = counts.Inserted,
        Skipped = counts.Skipped,
        Omitted = counts.Omitted
    };

    private static BudgetThresholdInput MapThresholdInput(BudgetThresholdRequest request) => new()
    {
        Name = request.Name ?? string.Empty,
        Percent = request.Percent,
        Active = request.Active
    };

    private static BudgetResponse MapBudget(Budget budget) => new()
    {
        BudgetId = budget.BudgetId,
        UserId = budget.UserId,
        PeriodKey = budget.PeriodKey,
        Name = budget.Name,
        CategoryId = budget.CategoryId,
        SubcategoryId = budget.SubcategoryId,
        AmountMxn = budget.AmountMxn,
        Active = budget.Active,
        Created = budget.Created,
        Updated = budget.Updated,
        Thresholds = budget.Thresholds
            .OrderBy(t => t.Percent)
            .Select(t => new BudgetThresholdResponse
            {
                ThresholdId = t.ThresholdId,
                Name = t.Name,
                Percent = t.Percent,
                Active = t.Active
            })
            .ToList()
    };

    internal static BudgetStatusResponse MapStatus(BudgetStatusResult result) => new()
    {
        BudgetId = result.BudgetId,
        Name = result.Name,
        PeriodKey = result.PeriodKey,
        CategoryId = result.CategoryId,
        SubcategoryId = result.SubcategoryId,
        Active = result.Active,
        AmountMxn = result.AmountMxn,
        Spent = result.Spent,
        SpentPercent = result.SpentPercent,
        Committed = result.Committed,
        CommittedPercent = result.CommittedPercent,
        Projected = result.Projected,
        ProjectedPercent = result.ProjectedPercent,
        Effective = result.Effective,
        Forecast = result.Forecast,
        PercentUsed = result.PercentUsed,
        ThresholdPercent = result.ThresholdPercent,
        Remaining = result.Remaining,
        PlannedAmount = result.PlannedAmount,
        Variance = result.Variance,
        ItemsPending = result.ItemsPending,
        ItemsExecuted = result.ItemsExecuted,
        ItemsUnexecuted = result.ItemsUnexecuted,
        ItemsIgnored = result.ItemsIgnored,
        PlannedIncome = result.PlannedIncome,
        CommittedIncome = result.CommittedIncome,
        ProjectedIncome = result.ProjectedIncome,
        Status = result.Status,
        ReachedThreshold = result.ReachedThreshold == null
            ? null
            : new BudgetThresholdStatusResponse
            {
                ThresholdId = result.ReachedThreshold.ThresholdId,
                Name = result.ReachedThreshold.Name,
                Percent = result.ReachedThreshold.Percent
            }
    };

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }
}
