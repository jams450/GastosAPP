namespace GastosApp.API.Interfaces;

public interface IJwtService
{
    string GenerateToken(int userId, string username, bool isAdmin = false);
    DateTime GetTokenExpiration();
}
