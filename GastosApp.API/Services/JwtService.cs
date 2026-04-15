using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using GastosApp.API.Interfaces;
using Microsoft.IdentityModel.Tokens;

namespace GastosApp.API.Services;

public class JwtService : IJwtService
{
    private readonly IConfiguration _configuration;
    private readonly SymmetricSecurityKey _securityKey;

    public JwtService(IConfiguration configuration)
    {
        _configuration = configuration;
        var key = _configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT Key not configured");
        _securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    }

    public string GenerateToken(int userId, string username, bool isAdmin = false)
    {
        var credentials = new SigningCredentials(_securityKey, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Name, username),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        // Agregar claim de Admin si corresponde
        if (isAdmin)
        {
            claims.Add(new Claim(ClaimTypes.Role, "Admin"));
        }

        var token = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"],
            audience: _configuration["Jwt:Audience"],
            claims: claims,
            expires: GetTokenExpiration(),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public DateTime GetTokenExpiration()
    {
        var expirationHours = _configuration.GetValue<int>("Jwt:ExpirationHours", 2);
        return DateTime.UtcNow.AddHours(expirationHours);
    }
}
