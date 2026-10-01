using GastosApp.API.Models.Investments;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Investments;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Fixed-income investment catalog and monthly plan. Admin-only, user-scoped through
/// <see cref="ICurrentUserService"/>, and strictly read-only with respect to money: no endpoint here
/// creates transactions or changes account balances, credit data, MSI or installments.
///
/// Responses are purpose-built DTOs from the business layer; no EF entity or navigation graph is
/// serialized. <c>GET plans/{id}</c> returns the plan detail (allocations + exclusions, no series)
/// while <c>GET plans/{id}/projection</c> additionally returns the monthly series.
/// </summary>
[ApiController]
[Route("api/investments")]
[Authorize(Policy = "AdminWithId")]
public class InvestmentsController : ControllerBase
{
    private readonly IInvestmentService _service;
    private readonly ICurrentUserService _currentUser;

    public InvestmentsController(IInvestmentService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet("products")]
    public async Task<IActionResult> Products() => Ok(await _service.ListProductsAsync(UserId));

    [HttpGet("products/{id:int}")]
    public async Task<IActionResult> Product(int id)
    {
        var product = await _service.GetProductAsync(id, UserId);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpPost("products")]
    public async Task<IActionResult> CreateProduct(InvestmentProductRequest request)
    {
        try
        {
            var product = await _service.CreateProductAsync(UserId, Input(request));
            return CreatedAtAction(nameof(Product), new { id = product.InvestmentProductId }, product);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    [HttpPut("products/{id:int}")]
    public async Task<IActionResult> UpdateProduct(int id, InvestmentProductRequest request)
    {
        try
        {
            var product = await _service.UpdateProductAsync(id, UserId, Input(request));
            return product is null ? NotFound() : Ok(product);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    [HttpPatch("products/{id:int}/active")]
    public async Task<IActionResult> Active(int id, InvestmentProductActiveRequest request)
    {
        try
        {
            return await _service.SetProductActiveAsync(id, UserId, request.Active) ? Ok() : NotFound();
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>
    /// Plan for the requested month. Returns the persisted plan, or a derived draft carried from the
    /// most recent previous plan (<c>isPersisted = false</c>, with per-offer freshness and pending
    /// conditions). 404 only when the user has no prior plan and no products.
    /// </summary>
    [HttpGet("plans/current")]
    public async Task<IActionResult> Current([FromQuery] string? planMonth)
    {
        try
        {
            var plan = await _service.GetCurrentPlanAsync(UserId, planMonth);
            return plan is null ? NotFound() : Ok(plan);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>Plan detail: allocations, tier snapshots and exclusions. Deliberately has no monthly series.</summary>
    [HttpGet("plans/{id:int}")]
    public async Task<IActionResult> Plan(int id)
    {
        var plan = await _service.GetPlanAsync(id, UserId);
        return plan is null ? NotFound() : Ok(plan);
    }

    /// <summary>Projection: the monthly series per allocation plus the exclusions recorded at generation.</summary>
    [HttpGet("plans/{id:int}/projection")]
    public async Task<IActionResult> Projection(int id)
    {
        var projection = await _service.GetPlanProjectionAsync(id, UserId);
        return projection is null ? NotFound() : Ok(projection);
    }

    [HttpPost("plans")]
    public async Task<IActionResult> Generate(InvestmentPlanGenerateRequest request)
    {
        try
        {
            var plan = await _service.GeneratePlanAsync(UserId, new InvestmentPlanGenerateInput
            {
                PlanMonth = request.PlanMonth,
                ProjectionMonths = request.ProjectionMonths,
                ConfirmedTierIds = request.ConfirmedTierIds ?? []
            });

            return Ok(plan);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    private int UserId => _currentUser.GetUserId() ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");

    private static InvestmentProductInput Input(InvestmentProductRequest request) => new()
    {
        AccountId = request.AccountId,
        Name = request.Name,
        Institution = request.Institution,
        Active = request.Active,
        Offers = (request.Offers ?? []).Select(offer => new InvestmentOfferInput
        {
            CapturedForMonth = offer.CapturedForMonth,
            ValidFrom = offer.ValidFrom,
            ValidTo = offer.ValidTo,
            SourceUrl = offer.SourceUrl,
            SourceLabel = offer.SourceLabel,
            TermsText = offer.TermsText,
            ConditionsConfirmed = offer.ConditionsConfirmed,
            Tiers = (offer.Tiers ?? []).Select(t => new InvestmentTierInput
            {
                MinimumAmount = t.MinimumAmount,
                MaximumAmount = t.MaximumAmount,
                AnnualRatePercent = t.AnnualRatePercent,
                SpecialConditionText = t.SpecialConditionText
            }).ToList()
        }).ToList()
    };
}
