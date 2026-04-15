using GastosApp.API.Models.Auth;
using GastosApp.API.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
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

            var response = await _authService.AuthenticateAsync(request);

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
}
