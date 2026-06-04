using GastosApp.BusinessLogic.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Policy = "UserWithId")]
    public class DashboardController : ControllerBase
    {
        private const string DashboardTimezone = "America/Mexico_City";

        private readonly IDashboardService _dashboardService;
        private readonly ICurrentUserService _currentUserService;
        private readonly ILogger<DashboardController> _logger;

        public DashboardController(
            IDashboardService dashboardService,
            ICurrentUserService currentUserService,
            ILogger<DashboardController> logger)
        {
            _dashboardService = dashboardService;
            _currentUserService = currentUserService;
            _logger = logger;
        }

        [HttpGet("overview")]
        public async Task<IActionResult> GetOverview([FromQuery] string? month)
        {
            try
            {
                var userId = GetCurrentUserId();
                var result = await _dashboardService.GetOverviewAsync(userId, month, DashboardTimezone);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving dashboard overview");
                return StatusCode(500, new { Message = "An error occurred while retrieving dashboard data" });
            }
        }

        private int GetCurrentUserId()
        {
            return _currentUserService.GetUserId()
                ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
        }
    }
}
