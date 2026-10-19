using GastosApp.API.Extensions;
using GastosApp.API.Models.Auth;
using GastosApp.API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
// The only public controller besides the Telegram webhook, and now explicitly so: it used to rely on
// having no attribute at all, which the fail-closed default policy in AddApiAuthorization would have
// turned into a 401 on login.
[AllowAnonymous]
// login, refresh and logout are the only unauthenticated endpoints of this application.
[EnableRateLimiting(RateLimitingExtensions.AuthPolicy)]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(IAuthService authService, ILogger<AuthController> logger)
    {
        _authService = authService;
        _logger = logger;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            {
                return BadRequest(new { Message = "Username and password are required" });
            }

            var response = await _authService.AuthenticateAsync(
                request,
                HttpContext.Connection.RemoteIpAddress?.ToString(),
                Request.Headers.UserAgent.ToString());

            if (response == null)
            {
                _logger.LogWarning("Failed login attempt for user: {Username}", request.Username);
                return Unauthorized(new { Message = "Invalid credentials" });
            }

            _logger.LogInformation("User {Username} logged in successfully", request.Username);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during login for user: {Username}", request.Username);
            return StatusCode(500, new { Message = "An error occurred during authentication" });
        }
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.RefreshToken))
            {
                return BadRequest(new { Message = "Refresh token is required" });
            }

            var response = await _authService.RefreshAsync(
                request.RefreshToken,
                HttpContext.Connection.RemoteIpAddress?.ToString(),
                Request.Headers.UserAgent.ToString());
            if (response == null)
            {
                return Unauthorized(new { Message = "Invalid refresh token" });
            }

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during token refresh");
            return StatusCode(500, new { Message = "An error occurred during token refresh" });
        }
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshTokenRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.RefreshToken))
            {
                return Ok(new { Ok = true });
            }

            await _authService.RevokeRefreshTokenAsync(request.RefreshToken);
            return Ok(new { Ok = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during logout");
            return StatusCode(500, new { Message = "An error occurred during logout" });
        }
    }
}
