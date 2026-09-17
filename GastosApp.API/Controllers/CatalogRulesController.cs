using GastosApp.API.Models.CatalogRules;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class CatalogRulesController : ControllerBase
{
    private const int MaxPriority = 1_000_000;

    private readonly ICatalogRuleService _catalogRuleService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<CatalogRulesController> _logger;

    public CatalogRulesController(
        ICatalogRuleService catalogRuleService,
        ICurrentUserService currentUserService,
        ILogger<CatalogRulesController> logger)
    {
        _catalogRuleService = catalogRuleService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool? active = null, [FromQuery] string? q = null)
    {
        var userId = GetCurrentUserId();
        var rules = await _catalogRuleService.GetByUserIdAsync(userId, active == true);

        if (active == false)
        {
            // El servicio solo puede filtrar "solo activas"; inactive-only se resuelve aquí.
            rules = rules.Where(r => !r.Active);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            rules = rules.Where(r =>
                r.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                r.MatchValue.Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        return Ok(rules.Select(Map));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var userId = GetCurrentUserId();
        var rule = await _catalogRuleService.GetByIdAsync(id, userId);
        if (rule == null)
        {
            return NotFound(new { Message = $"Catalog rule with ID {id} not found" });
        }

        return Ok(Map(rule));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CatalogRuleCreateRequest request)
    {
        if (request.Priority < 0 || request.Priority > MaxPriority)
        {
            return BadRequest(new { Message = $"La prioridad debe estar entre 0 y {MaxPriority}" });
        }

        try
        {
            var userId = GetCurrentUserId();
            var rule = new CatalogRule
            {
                Name = request.Name,
                MatchType = request.MatchType,
                MatchValue = request.MatchValue,
                TargetCategoryId = request.TargetCategoryId,
                TargetSubcategoryId = request.TargetSubcategoryId,
                Priority = request.Priority,
                Active = request.Active
            };

            var created = await _catalogRuleService.CreateAsync(rule, userId);
            return CreatedAtAction(nameof(GetById), new { id = created.RuleId }, Map(created));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating catalog rule");
            return StatusCode(500, new { Message = "An error occurred while creating catalog rule" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] CatalogRuleUpdateRequest request)
    {
        if (request.Priority < 0 || request.Priority > MaxPriority)
        {
            return BadRequest(new { Message = $"La prioridad debe estar entre 0 y {MaxPriority}" });
        }

        try
        {
            var userId = GetCurrentUserId();
            var update = new CatalogRule
            {
                Name = request.Name,
                MatchType = request.MatchType,
                MatchValue = request.MatchValue,
                TargetCategoryId = request.TargetCategoryId,
                TargetSubcategoryId = request.TargetSubcategoryId,
                Priority = request.Priority,
                Active = request.Active
            };

            var updated = await _catalogRuleService.UpdateAsync(id, update, userId);
            if (updated == null)
            {
                return NotFound(new { Message = $"Catalog rule with ID {id} not found" });
            }

            return Ok(Map(updated));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating catalog rule {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating catalog rule" });
        }
    }

    [HttpPatch("{id}/active")]
    public async Task<IActionResult> UpdateActiveStatus(int id, [FromBody] bool active)
    {
        var userId = GetCurrentUserId();
        var updated = await _catalogRuleService.SetActiveAsync(id, userId, active);
        if (!updated)
        {
            return NotFound(new { Message = $"Catalog rule with ID {id} not found" });
        }

        return Ok(new { Message = $"Catalog rule active status updated to {active}" });
    }

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }

    private static CatalogRuleResponse Map(CatalogRule rule)
    {
        return new CatalogRuleResponse
        {
            RuleId = rule.RuleId,
            UserId = rule.UserId,
            Name = rule.Name,
            MatchType = rule.MatchType,
            MatchValue = rule.MatchValue,
            TargetCategoryId = rule.TargetCategoryId,
            TargetSubcategoryId = rule.TargetSubcategoryId,
            Priority = rule.Priority,
            Active = rule.Active
        };
    }
}
