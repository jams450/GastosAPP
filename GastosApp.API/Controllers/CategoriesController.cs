using GastosApp.API.Models.Categories;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class CategoriesController : ControllerBase
{
    private static readonly HashSet<string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "income",
        "expense",
        "transfer"
    };

    private readonly ICategoryService _categoryService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<CategoriesController> _logger;

    public CategoriesController(
        ICategoryService categoryService,
        ICurrentUserService currentUserService,
        ILogger<CategoriesController> logger)
    {
        _categoryService = categoryService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var userId = GetCurrentUserId();
            var categories = await _categoryService.GetAllByUserIdAsync(userId);
            var response = categories.Select(MapCategoryToResponse);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving categories");
            return StatusCode(500, new { Message = "An error occurred while retrieving categories" });
        }
    }

    [HttpGet("active")]
    public async Task<IActionResult> GetAllActive()
    {
        try
        {
            var userId = GetCurrentUserId();
            var categories = await _categoryService.GetAllActiveByUserIdAsync(userId);
            var response = categories.Select(MapCategoryToResponse);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving active categories");
            return StatusCode(500, new { Message = "An error occurred while retrieving categories" });
        }
    }

    [HttpGet("type/{type}")]
    public async Task<IActionResult> GetByType(string type)
    {
        try
        {
            if (!AllowedTypes.Contains(type))
            {
                return BadRequest(new
                {
                    Message = "Invalid category type. Allowed values: income, expense, transfer"
                });
            }

            var userId = GetCurrentUserId();
            var categories = await _categoryService.GetByTypeAsync(userId, type);
            var response = categories.Select(MapCategoryToResponse);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving categories by type {Type}", type);
            return StatusCode(500, new { Message = "An error occurred while retrieving categories" });
        }
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var category = await _categoryService.GetByIdWithTagsAsync(id, userId);
            if (category == null)
            {
                return NotFound(new { Message = $"Category with ID {id} not found" });
            }

            return Ok(MapCategoryToResponse(category));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving category with ID {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while retrieving the category" });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CategoryCreateRequest request)
    {
        try
        {
            if (!AllowedTypes.Contains(request.Type))
            {
                return BadRequest(new { Message = "Invalid category type. Allowed values: income, expense, transfer" });
            }

            var userId = GetCurrentUserId();
            var category = new Category
            {
                UserId = userId,
                Name = request.Name.Trim(),
                Color = request.Color,
                Type = request.Type.Trim().ToLowerInvariant(),
                Active = request.Active
            };

            var created = await _categoryService.CreateWithTagsAsync(category, userId, request.Tags);
            return CreatedAtAction(nameof(GetById), new { id = created.CategoryId }, MapCategoryToResponse(created));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating category");
            return StatusCode(500, new { Message = "An error occurred while creating the category" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] CategoryUpdateRequest request)
    {
        try
        {
            if (!AllowedTypes.Contains(request.Type))
            {
                return BadRequest(new { Message = "Invalid category type. Allowed values: income, expense, transfer" });
            }

            var userId = GetCurrentUserId();
            var category = new Category
            {
                Name = request.Name.Trim(),
                Color = request.Color,
                Type = request.Type.Trim().ToLowerInvariant(),
                Active = request.Active
            };

            var updated = await _categoryService.UpdateWithTagsAsync(id, category, userId, request.Tags);
            if (updated == null)
            {
                return NotFound(new { Message = $"Category with ID {id} not found" });
            }

            return Ok(MapCategoryToResponse(updated));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating category {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating the category" });
        }
    }

    [HttpPatch("{id}/active")]
    public async Task<IActionResult> UpdateActiveStatus(int id, [FromBody] bool active)
    {
        try
        {
            var userId = GetCurrentUserId();
            var category = await _categoryService.GetByIdAsync(id);
            if (category == null || (category.UserId != null && category.UserId != userId))
            {
                return NotFound(new { Message = $"Category with ID {id} not found" });
            }

            var updated = await _categoryService.UpdateActiveStatusAsync(id, active);
            if (!updated)
            {
                return StatusCode(500, new { Message = "Failed to update category status" });
            }

            return Ok(new { Message = $"Category active status updated to {active}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating category active status {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating category status" });
        }
    }

    private static CategoryResponse MapCategoryToResponse(Category category)
    {
        var tags = category.CategoryTags
            .Where(ct => ct.Tag != null)
            .Select(ct => ct.Tag.Name)
            .OrderBy(tag => tag)
            .ToArray();

        return new CategoryResponse
        {
            CategoryId = category.CategoryId,
            UserId = category.UserId,
            Name = category.Name,
            Color = category.Color,
            Type = category.Type,
            Active = category.Active,
            Tags = tags
        };
    }

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }
}
