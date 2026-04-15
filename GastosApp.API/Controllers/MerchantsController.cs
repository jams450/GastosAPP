using GastosApp.API.Models.Merchants;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class MerchantsController : ControllerBase
{
    private readonly IMerchantService _merchantService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<MerchantsController> _logger;

    public MerchantsController(
        IMerchantService merchantService,
        ICurrentUserService currentUserService,
        ILogger<MerchantsController> logger)
    {
        _merchantService = merchantService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool onlyActive = false)
    {
        var userId = GetCurrentUserId();
        var merchants = await _merchantService.GetByUserIdAsync(userId, onlyActive);
        return Ok(merchants.Select(Map));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var userId = GetCurrentUserId();
        var merchant = await _merchantService.GetByIdAsync(id, userId);
        if (merchant == null)
        {
            return NotFound(new { Message = $"Merchant with ID {id} not found" });
        }

        return Ok(Map(merchant));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] MerchantCreateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var merchant = new Merchant
            {
                Name = request.Name,
                Active = request.Active
            };

            var created = await _merchantService.CreateAsync(merchant, userId);
            return CreatedAtAction(nameof(GetById), new { id = created.MerchantId }, Map(created));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating merchant");
            return StatusCode(500, new { Message = "An error occurred while creating merchant" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] MerchantUpdateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var update = new Merchant
            {
                Name = request.Name,
                Active = request.Active
            };

            var updated = await _merchantService.UpdateAsync(id, update, userId);
            if (updated == null)
            {
                return NotFound(new { Message = $"Merchant with ID {id} not found" });
            }

            return Ok(Map(updated));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating merchant {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating merchant" });
        }
    }

    [HttpPatch("{id}/active")]
    public async Task<IActionResult> UpdateActiveStatus(int id, [FromBody] bool active)
    {
        var userId = GetCurrentUserId();
        var updated = await _merchantService.UpdateActiveStatusAsync(id, userId, active);
        if (!updated)
        {
            return NotFound(new { Message = $"Merchant with ID {id} not found" });
        }

        return Ok(new { Message = $"Merchant active status updated to {active}" });
    }

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }

    private static MerchantResponse Map(Merchant merchant)
    {
        return new MerchantResponse
        {
            MerchantId = merchant.MerchantId,
            UserId = merchant.UserId,
            Name = merchant.Name,
            NormalizedName = merchant.NormalizedName,
            Active = merchant.Active
        };
    }
}
