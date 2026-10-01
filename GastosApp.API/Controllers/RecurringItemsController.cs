using GastosApp.API.Models.Recurring;
using GastosApp.BusinessLogic.Exceptions;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Recurring;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Catálogo de gastos e ingresos programados. El <c>userId</c> siempre proviene del token
/// (<see cref="ICurrentUserService"/>), nunca del payload, y todo acceso a una plantilla ajena se
/// resuelve como 404. Rigor de roles: <c>UserWithId</c>, igual que el resto del API; el guard de
/// admin vive en la página del frontend, no aquí. Los logs nunca incluyen montos, nombres ni payload.
/// </summary>
[ApiController]
[Route("api/recurring-items")]
[Authorize(Policy = "UserWithId")]
public class RecurringItemsController : ControllerBase
{
    private readonly IRecurringItemService _recurringItemService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<RecurringItemsController> _logger;

    public RecurringItemsController(
        IRecurringItemService recurringItemService,
        ICurrentUserService currentUserService,
        ILogger<RecurringItemsController> logger)
    {
        _recurringItemService = recurringItemService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? kind, [FromQuery] bool? active)
    {
        try
        {
            var userId = GetCurrentUserId();
            var items = await _recurringItemService.ListAsync(userId, new RecurringItemQuery
            {
                Kind = kind,
                Active = active
            });

            return Ok(items.Select(MapItem));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving recurring items");
            return StatusCode(500, new { Message = "An error occurred while retrieving recurring items" });
        }
    }

    /// <summary>
    /// Soporte del checkbox <c>autoExecute</c>: indica si hay salida de Telegram configurada.
    /// No expone token, <c>chat_id</c> ni ninguna credencial.
    /// </summary>
    [HttpGet("config")]
    public IActionResult GetConfig()
    {
        var config = _recurringItemService.GetConfig();
        return Ok(new RecurringItemConfigResponse
        {
            AutoExecuteAvailable = config.AutoExecuteAvailable,
            Reason = config.Reason
        });
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var item = await _recurringItemService.GetAsync(id, userId);
            if (item == null)
            {
                return NotFound(new { Message = $"Recurring item with ID {id} not found" });
            }

            return Ok(MapItem(item));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving recurring item with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while retrieving the recurring item" });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] RecurringItemCreateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var created = await _recurringItemService.CreateAsync(userId, MapWriteInput(request));

            _logger.LogInformation("Recurring item created successfully: {RecurringItemId}", created.RecurringItemId);

            return CreatedAtAction(nameof(GetById), new { id = created.RecurringItemId }, MapItem(created));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating recurring item");
            return StatusCode(500, new { Message = "An error occurred while creating the recurring item" });
        }
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] RecurringItemUpdateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var updated = await _recurringItemService.UpdateAsync(id, userId, MapWriteInput(request));
            if (updated == null)
            {
                return NotFound(new { Message = $"Recurring item with ID {id} not found" });
            }

            _logger.LogInformation("Recurring item updated successfully: {RecurringItemId}", id);

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
            _logger.LogError(ex, "Error updating recurring item with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating the recurring item" });
        }
    }

    /// <summary>Activa o desactiva la plantilla. Desactivar detiene el motor en el próximo ciclo.</summary>
    [HttpPatch("{id:int}/active")]
    public async Task<IActionResult> UpdateActive(int id, [FromBody] bool active)
    {
        try
        {
            var userId = GetCurrentUserId();
            var updated = await _recurringItemService.SetActiveAsync(id, userId, active);
            if (updated == null)
            {
                return NotFound(new { Message = $"Recurring item with ID {id} not found" });
            }

            _logger.LogInformation("Recurring item {Id} active status updated to {Active}", id, active);

            return Ok(MapItem(updated));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating active status for recurring item with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating the recurring item status" });
        }
    }

    /// <summary>
    /// Puerta del histórico: deriva una plantilla de una transacción existente. Con
    /// <c>dryRun</c> (default) solo devuelve la propuesta; una plantilla activa con el mismo
    /// <c>(kind, name)</c> devuelve 409 con la existente en el cuerpo.
    /// </summary>
    [HttpPost("from-transaction")]
    public async Task<IActionResult> CreateFromTransaction([FromBody] RecurringItemFromTransactionRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _recurringItemService.CreateFromTransactionAsync(
                userId,
                request.TransactionId,
                request.DryRun);

            if (result.Conflict)
            {
                return Conflict(new RecurringItemFromTransactionResponse
                {
                    DryRun = result.DryRun,
                    Written = false,
                    Conflict = true,
                    Existing = result.Existing == null ? null : MapItem(result.Existing)
                });
            }

            // Transacción inexistente o de otro usuario: mismo 404, nunca 403 con datos.
            if (result.Template == null)
            {
                return NotFound(new { Message = $"Transaction with ID {request.TransactionId} not found" });
            }

            return Ok(new RecurringItemFromTransactionResponse
            {
                DryRun = result.DryRun,
                Written = result.Written,
                Conflict = false,
                Template = MapItem(result.Template)
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deriving a recurring item from a transaction");
            return StatusCode(500, new { Message = "An error occurred while scheduling the transaction" });
        }
    }

    private static RecurringItemWriteInput MapWriteInput(RecurringItemCreateRequest request) => new()
    {
        Kind = request.Kind ?? string.Empty,
        Name = request.Name ?? string.Empty,
        AmountMode = request.AmountMode,
        AmountMxn = request.AmountMxn,
        DayOfMonth = request.DayOfMonth,
        CategoryId = request.CategoryId,
        SubcategoryId = request.SubcategoryId,
        AccountId = request.AccountId,
        MerchantId = request.MerchantId,
        StartsPeriod = request.StartsPeriod,
        EndsPeriod = request.EndsPeriod,
        AutoExecute = request.AutoExecute,
        EffectiveFrom = request.EffectiveFrom
    };

    private static RecurringItemWriteInput MapWriteInput(RecurringItemUpdateRequest request) => new()
    {
        Kind = request.Kind ?? string.Empty,
        Name = request.Name ?? string.Empty,
        AmountMode = request.AmountMode,
        AmountMxn = request.AmountMxn,
        DayOfMonth = request.DayOfMonth,
        CategoryId = request.CategoryId,
        SubcategoryId = request.SubcategoryId,
        AccountId = request.AccountId,
        MerchantId = request.MerchantId,
        StartsPeriod = request.StartsPeriod,
        EndsPeriod = request.EndsPeriod,
        AutoExecute = request.AutoExecute,
        EffectiveFrom = request.EffectiveFrom
    };

    internal static RecurringItemResponse MapItem(RecurringItemDetail item) => new()
    {
        RecurringItemId = item.RecurringItemId,
        Kind = item.Kind,
        Name = item.Name,
        AmountMode = item.AmountMode,
        AmountMxn = item.AmountMxn,
        DayOfMonth = item.DayOfMonth,
        CategoryId = item.CategoryId,
        SubcategoryId = item.SubcategoryId,
        AccountId = item.AccountId,
        MerchantId = item.MerchantId,
        StartsPeriod = item.StartsPeriod,
        EndsPeriod = item.EndsPeriod,
        Active = item.Active,
        AutoExecute = item.AutoExecute,
        EffectiveFrom = item.EffectiveFrom,
        Created = item.Created,
        Updated = item.Updated
    };

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }
}
