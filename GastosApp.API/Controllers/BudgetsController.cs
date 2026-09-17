using GastosApp.API.Models.Budgets;
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
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<BudgetsController> _logger;

    public BudgetsController(
        IBudgetService budgetService,
        ICurrentUserService currentUserService,
        ILogger<BudgetsController> logger)
    {
        _budgetService = budgetService;
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

    private static BudgetStatusResponse MapStatus(BudgetStatusResult result) => new()
    {
        BudgetId = result.BudgetId,
        Name = result.Name,
        PeriodKey = result.PeriodKey,
        CategoryId = result.CategoryId,
        SubcategoryId = result.SubcategoryId,
        Active = result.Active,
        AmountMxn = result.AmountMxn,
        Spent = result.Spent,
        Remaining = result.Remaining,
        PercentUsed = result.PercentUsed,
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
