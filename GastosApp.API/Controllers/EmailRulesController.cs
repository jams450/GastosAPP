using GastosApp.API.Models.EmailRules;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Reglas de clasificación de correo: remitente, dominio o asunto hacia una etiqueta. Misma forma que
/// <see cref="CatalogRulesController"/>; la diferencia es que el destino es una etiqueta y que el
/// <c>match_value</c> se guarda normalizado (lo hace el servicio), por eso acá no se normaliza.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class EmailRulesController : ControllerBase
{
    private const int MaxPriority = 1_000_000;

    private readonly IEmailRuleService _emailRuleService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<EmailRulesController> _logger;

    public EmailRulesController(
        IEmailRuleService emailRuleService,
        ICurrentUserService currentUserService,
        ILogger<EmailRulesController> logger)
    {
        _emailRuleService = emailRuleService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool? active = null, [FromQuery] string? q = null)
    {
        var userId = GetCurrentUserId();
        var rules = await _emailRuleService.GetByUserIdAsync(userId, active == true);

        if (active == false)
        {
            rules = rules.Where(rule => !rule.Active);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            rules = rules.Where(rule =>
                rule.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                rule.MatchValue.Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        return Ok(rules.Select(Map));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var userId = GetCurrentUserId();
        var rule = await _emailRuleService.GetByIdAsync(id, userId);
        if (rule == null)
        {
            return NotFound(new { Message = $"Email rule with ID {id} not found" });
        }

        return Ok(Map(rule));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] EmailRuleCreateRequest request)
    {
        if (request.Priority < 0 || request.Priority > MaxPriority)
        {
            return BadRequest(new { Message = $"La prioridad debe estar entre 0 y {MaxPriority}" });
        }

        try
        {
            var userId = GetCurrentUserId();
            var rule = new EmailRule
            {
                Name = request.Name,
                MatchField = request.MatchField,
                MatchType = request.MatchType,
                MatchValue = request.MatchValue,
                TargetLabelId = request.TargetLabelId,
                Priority = request.Priority,
                Active = request.Active
            };

            var created = await _emailRuleService.CreateAsync(rule, userId);
            var reloaded = await _emailRuleService.GetByIdAsync(created.EmailRuleId, userId);
            return CreatedAtAction(nameof(GetById), new { id = created.EmailRuleId }, Map(reloaded ?? created));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating email rule");
            return StatusCode(500, new { Message = "An error occurred while creating email rule" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] EmailRuleUpdateRequest request)
    {
        if (request.Priority < 0 || request.Priority > MaxPriority)
        {
            return BadRequest(new { Message = $"La prioridad debe estar entre 0 y {MaxPriority}" });
        }

        try
        {
            var userId = GetCurrentUserId();
            var update = new EmailRule
            {
                Name = request.Name,
                MatchField = request.MatchField,
                MatchType = request.MatchType,
                MatchValue = request.MatchValue,
                TargetLabelId = request.TargetLabelId,
                Priority = request.Priority,
                Active = request.Active
            };

            var updated = await _emailRuleService.UpdateAsync(id, update, userId);
            if (updated == null)
            {
                return NotFound(new { Message = $"Email rule with ID {id} not found" });
            }

            var reloaded = await _emailRuleService.GetByIdAsync(id, userId);
            return Ok(Map(reloaded ?? updated));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating email rule {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating email rule" });
        }
    }

    [HttpPatch("{id}/active")]
    public async Task<IActionResult> UpdateActiveStatus(int id, [FromBody] bool active)
    {
        var userId = GetCurrentUserId();
        var updated = await _emailRuleService.SetActiveAsync(id, userId, active);
        if (!updated)
        {
            return NotFound(new { Message = $"Email rule with ID {id} not found" });
        }

        return Ok(new { Message = $"Email rule active status updated to {active}" });
    }

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }

    private static EmailRuleResponse Map(EmailRule rule)
    {
        return new EmailRuleResponse
        {
            EmailRuleId = rule.EmailRuleId,
            UserId = rule.UserId,
            Name = rule.Name,
            MatchField = rule.MatchField,
            MatchType = rule.MatchType,
            MatchValue = rule.MatchValue,
            TargetLabelId = rule.TargetLabelId,
            TargetLabelName = rule.TargetLabel?.Name,
            TargetLabelBehavior = rule.TargetLabel?.Behavior,
            Priority = rule.Priority,
            Active = rule.Active
        };
    }
}
