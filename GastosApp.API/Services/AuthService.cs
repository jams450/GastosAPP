using GastosApp.API.Models.Auth;
using GastosApp.API.Interfaces;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using IPasswordService = GastosApp.BusinessLogic.Interfaces.IPasswordService;

namespace GastosApp.API.Services;

public class AuthService : IAuthService
{
    private readonly IConfiguration _configuration;
    private readonly IJwtService _jwtService;
    private readonly IUserService _userService;
    public AuthService(
        IConfiguration configuration, 
        IJwtService jwtService, 
        IUserService userService)
    {
        _configuration = configuration;
        _jwtService = jwtService;
        _userService = userService;
    }

    public async Task<LoginResponse?> AuthenticateAsync(LoginRequest request)
    {
        User? user = null;

        // Si es usuario admin, validar solo contra configuración explícita
        if (request.Username.Equals("admin", StringComparison.OrdinalIgnoreCase))
        {
            var adminUsername = _configuration["Auth:Username"];
            var adminPassword = _configuration["Auth:Password"];

            if (!string.IsNullOrWhiteSpace(adminUsername)
                && !string.IsNullOrWhiteSpace(adminPassword)
                && request.Username == adminUsername
                && request.Password == adminPassword)
            {
                user = new User
                {
                    UserId = 0,
                    Name = "Administrator",
                    Email = adminUsername,
                    Admin = true,
                    Active = true
                };
            }
        }
        else
        {
            // Para otros usuarios, buscar en la base de datos
            user = await _userService.ValidateCredentialsAsync(
                request.Username, 
                request.Password);
        }

        if (user == null)
        {
            return null;
        }

        var token = _jwtService.GenerateToken(user.UserId, user.Email, user.Admin);
        var expiration = _jwtService.GetTokenExpiration();

        var response = new LoginResponse(
            token,
            expiration,
            user.Email
        );

        return response;
    }
}
