using GastosApp.API.Models.Fx;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Fx;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Consulta de tipos de cambio. Solo lectura: el job diario es el único que escribe tasas automáticas, y
/// la tasa de un movimiento se congela en el movimiento, no aquí.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class FxRatesController : ControllerBase
{
    private readonly IFxRateQueryService _fxRateQueryService;
    private readonly ILogger<FxRatesController> _logger;

    public FxRatesController(IFxRateQueryService fxRateQueryService, ILogger<FxRatesController> logger)
    {
        _fxRateQueryService = fxRateQueryService;
        _logger = logger;
    }

    /// <summary>Última tasa conocida de cada divisa activa. Una divisa sin tasa publicada no aparece.</summary>
    [HttpGet("latest")]
    public async Task<IActionResult> GetLatest(CancellationToken cancellationToken)
    {
        try
        {
            var quotes = await _fxRateQueryService.GetLatestPerCurrencyAsync(cancellationToken);
            return Ok(quotes.Select(MapToLatestResponse));
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Error retrieving latest fx rates");
            return StatusCode(500, new { Message = "An error occurred while retrieving fx rates" });
        }
    }

    /// <summary>
    /// Tasa vigente de una divisa en una fecha, resuelta con carry-forward. Sin fecha se usa hoy.
    /// </summary>
    [HttpGet("rate")]
    public async Task<IActionResult> GetRate(
        [FromQuery] string? currency,
        [FromQuery] DateOnly? date,
        CancellationToken cancellationToken)
    {
        var code = (currency ?? string.Empty).Trim().ToUpperInvariant();
        if (code.Length != 3)
        {
            return BadRequest(new { Message = "currency must be a three-letter ISO 4217 code" });
        }

        var requestedDate = date ?? DateOnly.FromDateTime(DateTime.UtcNow);

        try
        {
            var quote = await _fxRateQueryService.ResolveAsync(code, requestedDate, cancellationToken);
            if (quote is null)
            {
                // No hay tasa publicada en o antes de la fecha pedida. Se responde 404 en lugar de una
                // tasa por defecto: convertir con un valor inventado es peor que no convertir.
                return NotFound(new
                {
                    Message = $"No fx rate is available for {code} on or before {requestedDate:yyyy-MM-dd}"
                });
            }

            return Ok(new ResolvedFxRateResponse
            {
                CurrencyCode = quote.CurrencyCode,
                RequestedDate = requestedDate,
                RateDate = quote.RateDate,
                RateMxn = quote.RateMxn,
                Source = quote.Source,
                IsCarryForward = quote.IsCarryForward(requestedDate)
            });
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Error resolving fx rate for {CurrencyCode}", code);
            return StatusCode(500, new { Message = "An error occurred while retrieving the fx rate" });
        }
    }

    private static LatestFxRateResponse MapToLatestResponse(FxRateQuote quote) => new()
    {
        CurrencyCode = quote.CurrencyCode,
        RateDate = quote.RateDate,
        RateMxn = quote.RateMxn,
        Source = quote.Source
    };
}
