using GastosApp.API.Models.Investments;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Investments;
using GastosApp.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/investments")]
[Authorize(Policy = "AdminWithId")]
public class InvestmentsController : ControllerBase
{
    private readonly IInvestmentService _service;
    private readonly ICurrentUserService _currentUser;
    public InvestmentsController(IInvestmentService service, ICurrentUserService currentUser) { _service = service; _currentUser = currentUser; }

    [HttpGet("products")] public async Task<IActionResult> Products() => Ok((await _service.ListProductsAsync(UserId)).Select(Map));
    [HttpGet("products/{id:int}")] public async Task<IActionResult> Product(int id) { var product = await _service.GetProductAsync(id, UserId); return product is null ? NotFound() : Ok(Map(product)); }
    [HttpPost("products")] public async Task<IActionResult> CreateProduct(InvestmentProductRequest request) { try { var product = await _service.CreateProductAsync(UserId, Input(request)); return CreatedAtAction(nameof(Product), new { id = product.InvestmentProductId }, Map(product)); } catch (ArgumentException ex) { return BadRequest(new { Message = ex.Message }); } }
    [HttpPut("products/{id:int}")] public async Task<IActionResult> UpdateProduct(int id, InvestmentProductRequest request) { try { var product = await _service.UpdateProductAsync(id, UserId, Input(request)); return product is null ? NotFound() : Ok(Map(product)); } catch (ArgumentException ex) { return BadRequest(new { Message = ex.Message }); } }
    [HttpPatch("products/{id:int}/active")] public async Task<IActionResult> Active(int id, InvestmentProductActiveRequest request) { try { return await _service.SetProductActiveAsync(id, UserId, request.Active) ? Ok() : NotFound(); } catch (ArgumentException ex) { return BadRequest(new { Message = ex.Message }); } }
    [HttpGet("plans/current")] public async Task<IActionResult> Current([FromQuery] string? planMonth) { try { var plan = await _service.GetCurrentPlanAsync(UserId, planMonth); return plan is null ? NotFound() : Ok(plan); } catch (ArgumentException ex) { return BadRequest(new { Message = ex.Message }); } }
    [HttpGet("plans/{id:int}")] public async Task<IActionResult> Plan(int id) { var plan = await _service.GetPlanAsync(id, UserId); return plan is null ? NotFound() : Ok(plan); }
    [HttpGet("plans/{id:int}/projection")] public async Task<IActionResult> Projection(int id) { var plan = await _service.GetPlanAsync(id, UserId); return plan is null ? NotFound() : Ok(plan); }
    [HttpPost("plans")] public async Task<IActionResult> Generate(InvestmentPlanGenerateRequest request) { try { return Ok(await _service.GeneratePlanAsync(UserId, request.PlanMonth, request.ProjectionMonths)); } catch (ArgumentException ex) { return BadRequest(new { Message = ex.Message }); } }
    private int UserId => _currentUser.GetUserId() ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    private static InvestmentProductInput Input(InvestmentProductRequest x) => new() { AccountId = x.AccountId, Name = x.Name, Institution = x.Institution, Active = x.Active, Offers = x.Offers.Select(offer => new InvestmentOfferInput { CapturedForMonth = offer.CapturedForMonth, ValidFrom = offer.ValidFrom, ValidTo = offer.ValidTo, SourceUrl = offer.SourceUrl, SourceLabel = offer.SourceLabel, ConditionsConfirmed = offer.ConditionsConfirmed, Tiers = offer.Tiers.Select(t => new InvestmentTierInput { MinimumAmount = t.MinimumAmount, MaximumAmount = t.MaximumAmount, AnnualRatePercent = t.AnnualRatePercent }).ToList() }).ToList() };
    private static object Map(InvestmentProduct x) => new { x.InvestmentProductId, x.AccountId, x.Name, x.Institution, x.Active, Offers = x.Offers.OrderByDescending(o => o.CapturedForMonth) };
}
