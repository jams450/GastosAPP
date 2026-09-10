using GastosApp.API.Models.Auth;

namespace GastosApp.API.Interfaces;

public interface IAuthService
{
    Task<LoginResponse?> AuthenticateAsync(LoginRequest request, string? ipAddress = null, string? userAgent = null);
    Task<LoginResponse?> RefreshAsync(string refreshToken, string? ipAddress = null, string? userAgent = null);
    Task<bool> RevokeRefreshTokenAsync(string refreshToken);
}
