using GastosApp.API.Models.Fx;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Catálogo de monedas. Es global y de solo lectura: las divisas se cargan por migración, no por el
/// usuario, así que no hay alta ni edición.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class CurrenciesController : ControllerBase
{
    private readonly ICurrencyService _currencyService;
    private readonly ILogger<CurrenciesController> _logger;

    public CurrenciesController(ICurrencyService currencyService, ILogger<CurrenciesController> logger)
    {
        _currencyService = currencyService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        try
        {
            var currencies = await _currencyService.GetActiveAsync(cancellationToken);
            return Ok(currencies.Select(MapCurrencyToResponse));
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Error retrieving currencies");
            return StatusCode(500, new { Message = "An error occurred while retrieving currencies" });
        }
    }

    private static CurrencyResponse MapCurrencyToResponse(Currency currency) => new()
    {
        Code = currency.Code,
        Name = currency.Name,
        Symbol = currency.Symbol,
        Decimals = currency.Decimals,
        IsBase = currency.IsBase
    };
}
