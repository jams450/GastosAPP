using GastosApp.API.Models.EmailLabels;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Catálogo de etiquetas y carpetas del clasificador de correo. No hay DELETE: una etiqueta en uso
/// dejaría reglas apuntando al vacío, así que el ciclo de vida es activar y desactivar.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class EmailLabelsController : ControllerBase
{
    private readonly IEmailLabelService _emailLabelService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<EmailLabelsController> _logger;

    public EmailLabelsController(
        IEmailLabelService emailLabelService,
        ICurrentUserService currentUserService,
        ILogger<EmailLabelsController> logger)
    {
        _emailLabelService = emailLabelService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool? active = null)
    {
        var userId = GetCurrentUserId();
        var labels = await _emailLabelService.GetByUserIdAsync(userId, active == true);

        if (active == false)
        {
            // El servicio solo puede filtrar "solo activas"; inactive-only se resuelve aquí.
            labels = labels.Where(label => !label.Active);
        }

        return Ok(labels.Select(Map));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var userId = GetCurrentUserId();
        var label = await _emailLabelService.GetByIdAsync(id, userId);
        if (label == null)
        {
            return NotFound(new { Message = $"Email label with ID {id} not found" });
        }

        return Ok(Map(label));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] EmailLabelCreateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var label = new EmailLabel
            {
                Name = request.Name,
                Slug = request.Slug ?? string.Empty,
                Kind = request.Kind,
                Behavior = request.Behavior,
                Description = request.Description,
                Color = request.Color,
                SortOrder = request.SortOrder,
                Active = request.Active
            };

            var created = await _emailLabelService.CreateAsync(label, userId);
            return CreatedAtAction(nameof(GetById), new { id = created.LabelId }, Map(created));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating email label");
            return StatusCode(500, new { Message = "An error occurred while creating email label" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] EmailLabelUpdateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var update = new EmailLabel
            {
                Name = request.Name,
                Slug = request.Slug ?? string.Empty,
                Kind = request.Kind,
                Behavior = request.Behavior,
                Description = request.Description,
                Color = request.Color,
                SortOrder = request.SortOrder,
                Active = request.Active
            };

            var updated = await _emailLabelService.UpdateAsync(id, update, userId);
            if (updated == null)
            {
                return NotFound(new { Message = $"Email label with ID {id} not found" });
            }

            return Ok(Map(updated));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating email label {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating email label" });
        }
    }

    [HttpPatch("{id}/active")]
    public async Task<IActionResult> UpdateActiveStatus(int id, [FromBody] bool active)
    {
        var userId = GetCurrentUserId();
        var updated = await _emailLabelService.SetActiveAsync(id, userId, active);
        if (!updated)
        {
            return NotFound(new { Message = $"Email label with ID {id} not found" });
        }

        return Ok(new { Message = $"Email label active status updated to {active}" });
    }

    /// <summary>
    /// Crea las etiquetas del sistema que falten. Es idempotente, así que la UI puede ofrecerlo como
    /// "restaurar predeterminadas" sin miedo a duplicar.
    /// </summary>
    [HttpPost("defaults")]
    public async Task<IActionResult> SeedDefaults()
    {
        var userId = GetCurrentUserId();
        var created = await _emailLabelService.EnsureDefaultsAsync(userId);
        return Ok(new { Created = created });
    }

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }

    private static EmailLabelResponse Map(EmailLabel label)
    {
        return new EmailLabelResponse
        {
            LabelId = label.LabelId,
            UserId = label.UserId,
            Name = label.Name,
            Slug = label.Slug,
            Kind = label.Kind,
            Behavior = label.Behavior,
            Description = label.Description,
            Color = label.Color,
            IsSystem = label.IsSystem,
            SortOrder = label.SortOrder,
            Active = label.Active
        };
    }
}
