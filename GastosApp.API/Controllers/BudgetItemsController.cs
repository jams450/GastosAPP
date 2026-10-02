using GastosApp.API.Models.BudgetItems;
using GastosApp.BusinessLogic.Exceptions;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.BusinessLogic.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Partidas planificadas de un presupuesto mensual. El <c>userId</c> siempre proviene del token
/// (<see cref="ICurrentUserService"/>), nunca del payload, y todo acceso a una partida ajena se
/// resuelve como 404. Los logs nunca incluyen montos, nombres de partida ni payload.
/// </summary>
[ApiController]
[Route("api/budget-items")]
[Authorize(Policy = "UserWithId")]
public class BudgetItemsController : ControllerBase
{
    private readonly IBudgetItemService _budgetItemService;
    private readonly IBudgetItemMatchService _budgetItemMatchService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<BudgetItemsController> _logger;

    public BudgetItemsController(
        IBudgetItemService budgetItemService,
        IBudgetItemMatchService budgetItemMatchService,
        ICurrentUserService currentUserService,
        ILogger<BudgetItemsController> logger)
    {
        _budgetItemService = budgetItemService;
        _budgetItemMatchService = budgetItemMatchService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? period,
        [FromQuery] string? kind,
        [FromQuery] string? status)
    {
        try
        {
            var userId = GetCurrentUserId();
            var items = await _budgetItemService.ListAsync(userId, new BudgetItemQuery
            {
                PeriodKey = period,
                Kind = kind,
                Status = status
            });

            return Ok(items.Select(MapItem));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving budget items");
            return StatusCode(500, new { Message = "An error occurred while retrieving budget items" });
        }
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var item = await _budgetItemService.GetAsync(id, userId);
            if (item == null)
            {
                return NotFound(new { Message = $"Budget item with ID {id} not found" });
            }

            return Ok(MapItem(item));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving budget item with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while retrieving the budget item" });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] BudgetItemCreateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var created = await _budgetItemService.CreateAsync(userId, MapWriteInput(request));

            _logger.LogInformation("Budget item created successfully: {ItemId}", created.ItemId);

            return CreatedAtAction(nameof(GetById), new { id = created.ItemId }, MapItem(created));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating budget item");
            return StatusCode(500, new { Message = "An error occurred while creating the budget item" });
        }
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] BudgetItemUpdateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var updated = await _budgetItemService.UpdateAsync(id, userId, MapWriteInput(request));
            if (updated == null)
            {
                return NotFound(new { Message = $"Budget item with ID {id} not found" });
            }

            _logger.LogInformation("Budget item updated successfully: {ItemId}", id);

            return Ok(MapItem(updated));
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
            _logger.LogError(ex, "Error updating budget item with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating the budget item" });
        }
    }

    /// <summary>Soft-delete: la partida pasa a <c>cancelled</c> y su monto se libera.</summary>
    [HttpPost("{id:int}/cancel")]
    public async Task<IActionResult> Cancel(int id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var found = await _budgetItemService.CancelAsync(id, userId);
            if (!found)
            {
                return NotFound(new { Message = $"Budget item with ID {id} not found" });
            }

            _logger.LogInformation("Budget item {Id} cancelled", id);
            return Ok(new { Message = "Budget item cancelled" });
        }
        catch (BudgetConflictException ex)
        {
            // Una partida ejecutada no se cancela por aquí: el conflicto es de estado, no un fallo interno.
            return Conflict(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error cancelling budget item with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while cancelling the budget item" });
        }
    }

    /// <summary>
    /// Transición manual de estado. <c>executed</c> solo aplica a una partida que ya tiene
    /// transacción enlazada; <c>cancelled</c> se alcanza con el endpoint de cancelación.
    /// </summary>
    [HttpPatch("{id:int}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] BudgetItemStatusRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var updated = await _budgetItemService.SetStatusAsync(id, userId, request.Status ?? string.Empty);
            if (updated == null)
            {
                return NotFound(new { Message = $"Budget item with ID {id} not found" });
            }

            _logger.LogInformation("Budget item {Id} status updated to {Status}", id, updated.Status);

            return Ok(MapItem(updated));
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
            _logger.LogError(ex, "Error updating status for budget item with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating the budget item status" });
        }
    }

    /// <summary>
    /// Purga de partidas <c>cancelled</c> de un periodo abierto. El periodo cerrado es un conflicto:
    /// su historial no se reescribe.
    /// </summary>
    [HttpDelete("purge")]
    public async Task<IActionResult> Purge([FromQuery] string? period)
    {
        try
        {
            var userId = GetCurrentUserId();
            var deleted = await _budgetItemService.PurgeCancelledAsync(userId, period);

            _logger.LogInformation("Purged {Deleted} cancelled budget items", deleted);

            return Ok(new BudgetItemPurgeResponse
            {
                PeriodKey = string.IsNullOrWhiteSpace(period) ? MonthRangeResolver.CurrentPeriodKey() : period,
                Deleted = deleted
            });
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
            _logger.LogError(ex, "Error purging cancelled budget items");
            return StatusCode(500, new { Message = "An error occurred while purging budget items" });
        }
    }

    /// <summary>
    /// Candidatas a match de un periodo. <b>Solo lectura: no escribe nada.</b> Devuelve los pares
    /// <b>débiles</b> (misma categoría/subcategoría, mismo mes) de partidas <c>pending</c> sin
    /// transacción enlazada; el enlace de una fuerte ya ocurrió solo al capturar el gasto. Es
    /// <c>period</c> obligatorio y con formato <c>yyyy-MM</c>: sin periodo la lista no tiene
    /// sentido porque el matching es por mes.
    /// </summary>
    [HttpGet("suggestions")]
    public async Task<IActionResult> GetSuggestions(
        [FromQuery] string? period,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetCurrentUserId();
            var suggestions = await _budgetItemMatchService.SuggestAsync(
                userId,
                period ?? string.Empty,
                cancellationToken);

            return Ok(suggestions.Select(MapSuggestion));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving budget item match suggestions");
            return StatusCode(500, new { Message = "An error occurred while retrieving match suggestions" });
        }
    }

    private static BudgetItemWriteInput MapWriteInput(BudgetItemCreateRequest request) => new()
    {
        Kind = request.Kind ?? string.Empty,
        Name = request.Name ?? string.Empty,
        PlannedAmount = request.PlannedAmount,
        PlannedDate = request.PlannedDate,
        CategoryId = request.CategoryId,
        SubcategoryId = request.SubcategoryId,
        AccountId = request.AccountId,
        MerchantId = request.MerchantId,
        Notes = request.Notes,
        RecurringItemId = request.RecurringItemId
    };

    private static BudgetItemWriteInput MapWriteInput(BudgetItemUpdateRequest request) => new()
    {
        Kind = request.Kind ?? string.Empty,
        Name = request.Name ?? string.Empty,
        PlannedAmount = request.PlannedAmount,
        PlannedDate = request.PlannedDate,
        CategoryId = request.CategoryId,
        SubcategoryId = request.SubcategoryId,
        AccountId = request.AccountId,
        MerchantId = request.MerchantId,
        Notes = request.Notes
    };

    internal static BudgetItemResponse MapItem(BudgetItemListItem item) => new()
    {
        ItemId = item.ItemId,
        PeriodKey = item.PeriodKey,
        Kind = item.Kind,
        Name = item.Name,
        PlannedAmount = item.PlannedAmount,
        PlannedDate = item.PlannedDate,
        CategoryId = item.CategoryId,
        SubcategoryId = item.SubcategoryId,
        AccountId = item.AccountId,
        MerchantId = item.MerchantId,
        RecurringItemId = item.RecurringItemId,
        Status = item.Status,
        IsProjected = item.IsProjected,
        TransactionId = item.TransactionId,
        Source = item.Source,
        Notes = item.Notes,
        Created = item.Created,
        Updated = item.Updated
    };

    internal static BudgetItemSuggestionResponse MapSuggestion(BudgetItemSuggestion suggestion) => new()
    {
        ItemId = suggestion.ItemId,
        PeriodKey = suggestion.PeriodKey,
        Kind = suggestion.Kind,
        Name = suggestion.Name,
        PlannedAmount = suggestion.PlannedAmount,
        PlannedDate = suggestion.PlannedDate,
        CategoryId = suggestion.CategoryId,
        SubcategoryId = suggestion.SubcategoryId,
        AccountId = suggestion.AccountId,
        MerchantId = suggestion.MerchantId,
        TransactionId = suggestion.TransactionId,
        TransactionAmount = suggestion.TransactionAmount,
        TransactionDate = suggestion.TransactionDate,
        DistanceDays = suggestion.DistanceDays,
        Strength = suggestion.Strength
    };

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }
}
