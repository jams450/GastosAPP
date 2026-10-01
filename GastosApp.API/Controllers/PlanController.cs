using GastosApp.API.Models.BudgetItems;
using GastosApp.API.Models.Plan;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Budgets;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Vista consolidada del plan de un periodo: presupuestos, partidas, ingresos planificados y
/// desviaciones. El <c>userId</c> siempre proviene del token. Los logs nunca incluyen montos.
/// </summary>
[ApiController]
[Route("api/plan")]
[Authorize(Policy = "UserWithId")]
public class PlanController : ControllerBase
{
    private readonly IPlanService _planService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<PlanController> _logger;

    public PlanController(
        IPlanService planService,
        ICurrentUserService currentUserService,
        ILogger<PlanController> logger)
    {
        _planService = planService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary([FromQuery] string? period)
    {
        try
        {
            var userId = GetCurrentUserId();
            var summary = await _planService.GetSummaryAsync(userId, period);
            return Ok(MapSummary(summary));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving plan summary");
            return StatusCode(500, new { Message = "An error occurred while retrieving the plan summary" });
        }
    }

    private static PlanSummaryResponse MapSummary(PlanSummaryResult result) => new()
    {
        PeriodKey = result.PeriodKey,
        Budgets = result.Budgets.Select(BudgetsController.MapStatus).ToList(),
        PlannedIncome = result.PlannedIncome,
        CommittedIncome = result.CommittedIncome,
        ProjectedIncome = result.ProjectedIncome,
        ExecutedIncome = result.ExecutedIncome,
        Variances = result.Variances
            .Select(v => new PlanItemVarianceResponse
            {
                ItemId = v.ItemId,
                Name = v.Name,
                Kind = v.Kind,
                PlannedAmount = v.PlannedAmount,
                ExecutedAmount = v.ExecutedAmount,
                Variance = v.Variance
            })
            .ToList(),
        ItemsWithoutBudget = result.ItemsWithoutBudget
            .Select(BudgetItemsController.MapItem)
            .ToList(),
        AccountFlows = result.AccountFlows
            .Select(f => new PlanAccountFlowResponse
            {
                AccountId = f.AccountId,
                PlannedExpense = f.PlannedExpense,
                PlannedIncome = f.PlannedIncome,
                ItemCount = f.ItemCount
            })
            .ToList()
    };

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }
}
