using GastosApp.API.Models.Auth;

namespace GastosApp.API.Interfaces;

public interface IAuthService
{
    Task<LoginResponse?> AuthenticateAsync(LoginRequest request);
}
