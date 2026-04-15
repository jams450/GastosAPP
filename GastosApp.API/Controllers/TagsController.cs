using GastosApp.API.Models.Tags;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class TagsController : ControllerBase
{
    private readonly ITagService _tagService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<TagsController> _logger;

    public TagsController(
        ITagService tagService,
        ICurrentUserService currentUserService,
        ILogger<TagsController> logger)
    {
        _tagService = tagService;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool onlyActive = false)
    {
        var userId = GetCurrentUserId();
        var tags = await _tagService.GetByUserIdAsync(userId, onlyActive);
        return Ok(tags.Select(Map));
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] int take = 20)
    {
        var userId = GetCurrentUserId();
        var tags = await _tagService.SearchAsync(userId, q, take);
        return Ok(tags.Select(Map));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var userId = GetCurrentUserId();
        var tag = await _tagService.GetByIdAsync(id, userId);
        if (tag == null)
        {
            return NotFound(new { Message = $"Tag with ID {id} not found" });
        }

        return Ok(Map(tag));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] TagCreateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var tag = new Tag
            {
                Name = request.Name,
                Active = request.Active
            };

            var created = await _tagService.CreateAsync(tag, userId);
            return CreatedAtAction(nameof(GetById), new { id = created.TagId }, Map(created));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating tag");
            return StatusCode(500, new { Message = "An error occurred while creating tag" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] TagUpdateRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var update = new Tag
            {
                Name = request.Name,
                Active = request.Active
            };

            var updated = await _tagService.UpdateAsync(id, update, userId);
            if (updated == null)
            {
                return NotFound(new { Message = $"Tag with ID {id} not found" });
            }

            return Ok(Map(updated));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating tag {Id}", id);
            return StatusCode(500, new { Message = "An error occurred while updating tag" });
        }
    }

    [HttpPatch("{id}/active")]
    public async Task<IActionResult> UpdateActiveStatus(int id, [FromBody] bool active)
    {
        var userId = GetCurrentUserId();
        var updated = await _tagService.UpdateActiveStatusAsync(id, userId, active);
        if (!updated)
        {
            return NotFound(new { Message = $"Tag with ID {id} not found" });
        }

        return Ok(new { Message = $"Tag active status updated to {active}" });
    }

    private int GetCurrentUserId()
    {
        return _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
    }

    private static TagResponse Map(Tag tag)
    {
        return new TagResponse
        {
            TagId = tag.TagId,
            UserId = tag.UserId,
            Name = tag.Name,
            NormalizedName = tag.NormalizedName,
            Active = tag.Active
        };
    }
}
