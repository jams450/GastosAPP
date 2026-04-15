using GastosApp.API.Models.Subcategories;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class SubcategoriesController : ControllerBase
{
    private readonly ISubcategoryService _subcategoryService;
    private readonly ICategoryService _categoryService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<SubcategoriesController> _logger;

    public SubcategoriesController(
        ISubcategoryService subcategoryService,
        ICategoryService categoryService,
        ICurrentUserService currentUserService,
        ILogger<SubcategoriesController> logger)
    {
        _subcategoryService = subcategoryService;
        _categoryService = categoryService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool onlyActive = false)
    {
        var userId = GetCurrentUserId();
        var subcategories = await _subcategoryService.GetByUserIdAsync(userId, onlyActive);
        return Ok(subcategories.Select(Map));
    }

    [HttpGet("category/{categoryId}")]
    public async Task<IActionResult> GetByCategory(int categoryId, [FromQuery] bool onlyActive = false)
    {
        var userId = GetCurrentUserId();
        var subcategories = await _subcategoryService.GetByCategoryIdAsync(userId, categoryId, onlyActive);
        return Ok(subcategories.Select(Map));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var userId = GetCurrentUserId();
        var subcategory = await _subcategoryService.GetByIdAsync(id, userId);
        if (subcategory == null)
        {
            return NotFound(new { Message = $"Subcategory with ID {id} not found" });
        }

        return Ok(Map(subcategory));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SubcategoryCreateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            if (!await IsCategoryAccessibleAsync(userId, request.CategoryId))
            {
                return BadRequest(new { Message = "Invalid category for current user" });
            }

            var subcategory = new Subcategory
            {
                CategoryId = request.CategoryId,
                Name = request.Name,
                Active = request.Active
            };

            var created = await _subcategoryService.CreateAsync(subcategory, userId);
            return CreatedAtAction(nameof(GetById), new { id = created.SubcategoryId }, Map(created));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating subcategory");
            return StatusCode(500, new { Message = "An error occurred while creating subcategory" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] SubcategoryUpdateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            if (!await IsCategoryAccessibleAsync(userId, request.CategoryId))
            {
                return BadRequest(new { Message = "Invalid category for current user" });
            }

            var update = new Subcategory
            {
                CategoryId = request.CategoryId,
                Name = request.Name,
                Active = request.Active
            };

            var updated = await _subcategoryService.UpdateAsync(id, update, userId);
            if (updated == null)
            {
                return NotFound(new { Message = $"Subcategory with ID {id} not found" });
            }

            return Ok(Map(updated));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating subcategory {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating subcategory" });
        }
    }

    [HttpPatch("{id}/active")]
    public async Task<IActionResult> UpdateActiveStatus(int id, [FromBody] bool active)
    {
        var userId = GetCurrentUserId();
        var updated = await _subcategoryService.UpdateActiveStatusAsync(id, userId, active);
        if (!updated)
        {
            return NotFound(new { Message = $"Subcategory with ID {id} not found" });
        }

        return Ok(new { Message = $"Subcategory active status updated to {active}" });
    }

    private async Task<bool> IsCategoryAccessibleAsync(int userId, int categoryId)
    {
        var category = await _categoryService.GetByIdAsync(categoryId);
        return category != null && (category.UserId == userId || category.UserId == null);
    }

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }

    private static SubcategoryResponse Map(Subcategory subcategory)
    {
        return new SubcategoryResponse
        {
            SubcategoryId = subcategory.SubcategoryId,
            UserId = subcategory.UserId,
            CategoryId = subcategory.CategoryId,
            Name = subcategory.Name,
            NormalizedName = subcategory.NormalizedName,
            Active = subcategory.Active
        };
    }
}
