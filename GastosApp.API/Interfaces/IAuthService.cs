using GastosApp.API.Models.Auth;

namespace GastosApp.API.Interfaces;

public interface IAuthService
{
    Task<LoginResponse?> AuthenticateAsync(LoginRequest request);
    Task<LoginResponse?> RefreshAsync(string refreshToken);
    Task<bool> RevokeRefreshTokenAsync(string refreshToken);
}
