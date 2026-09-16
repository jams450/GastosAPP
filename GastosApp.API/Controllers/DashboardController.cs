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
        public DashboardController(
            IDashboardService dashboardService,
            ICurrentUserService currentUserService)
        {
            _dashboardService = dashboardService;
            _currentUserService = currentUserService;
        }

        [HttpGet("overview")]
        public async Task<IActionResult> GetOverview([FromQuery] string? month)
        {
            var userId = GetCurrentUserId();
            var result = await _dashboardService.GetOverviewAsync(userId, month, DashboardTimezone);
            return Ok(result);
        }

        [HttpGet("projection")]
        public async Task<IActionResult> GetProjection([FromQuery] int? months)
        {
            var userId = GetCurrentUserId();
            var result = await _dashboardService.GetProjectionAsync(userId, months, DashboardTimezone);
            return Ok(result);
        }

        private int GetCurrentUserId()
        {
            return _currentUserService.GetUserId()
                ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
        }
    }
}
