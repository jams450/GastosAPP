using GastosApp.API.Models.BillableParties;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class BillablePartiesController : ControllerBase
{
    private readonly IBillablePartyService _billablePartyService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<BillablePartiesController> _logger;

    public BillablePartiesController(
        IBillablePartyService billablePartyService,
        ICurrentUserService currentUserService,
        ILogger<BillablePartiesController> logger)
    {
        _billablePartyService = billablePartyService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool onlyActive = false)
    {
        var userId = GetCurrentUserId();
        await _billablePartyService.EnsureSelfPartyAsync(userId, _currentUserService.GetName());
        var items = await _billablePartyService.GetByUserIdAsync(userId, onlyActive);
        return Ok(items.Select(Map));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var userId = GetCurrentUserId();
        var item = await _billablePartyService.GetByIdAsync(id, userId);
        if (item == null)
        {
            return NotFound(new { Message = $"Billable party with ID {id} not found" });
        }

        return Ok(Map(item));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] BillablePartyCreateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var created = await _billablePartyService.CreateAsync(new BillableParty
            {
                Type = request.Type,
                LinkedUserId = request.LinkedUserId,
                DisplayName = request.DisplayName,
                Notes = request.Notes,
                Active = true
            }, userId);

            return CreatedAtAction(nameof(GetById), new { id = created.BillablePartyId }, Map(created));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating billable party");
            return StatusCode(500, new { Message = "An error occurred while creating billable party" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] BillablePartyUpdateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var updated = await _billablePartyService.UpdateAsync(id, new BillableParty
            {
                Type = request.Type ?? string.Empty,
                LinkedUserId = request.LinkedUserId,
                DisplayName = request.DisplayName ?? string.Empty,
                Notes = request.Notes,
                Active = request.Active ?? true
            }, userId);

            if (updated == null)
            {
                return NotFound(new { Message = $"Billable party with ID {id} not found" });
            }

            return Ok(Map(updated));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating billable party {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating billable party" });
        }
    }

    [HttpPatch("{id}/active")]
    public async Task<IActionResult> UpdateActiveStatus(int id, [FromBody] bool active)
    {
        var userId = GetCurrentUserId();
        var updated = await _billablePartyService.UpdateActiveStatusAsync(id, userId, active);
        if (!updated)
        {
            return BadRequest(new { Message = $"Billable party with ID {id} not found or cannot be deactivated" });
        }

        return Ok(new { Message = $"Billable party active status updated to {active}" });
    }

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }

    private static BillablePartyResponse Map(BillableParty party)
    {
        return new BillablePartyResponse
        {
            BillablePartyId = party.BillablePartyId,
            OwnerUserId = party.OwnerUserId,
            LinkedUserId = party.LinkedUserId,
            Type = party.Type,
            DisplayName = party.DisplayName,
            Active = party.Active,
            Notes = party.Notes
        };
    }
}
