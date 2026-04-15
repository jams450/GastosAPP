using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using GastosApp.Models.Interfaces;

namespace GastosApp.API.Services
{
    public class CurrentUserService : ICurrentUserService
    {
        private readonly IHttpContextAccessor _httpContextAccessor;

        public CurrentUserService(IHttpContextAccessor httpContextAccessor)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        public int? GetUserId()
        {
            var claims = GetClaimsIdentity();
            var userIdClaim = claims?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? claims?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

            return int.TryParse(userIdClaim, out var userId) ? userId : null;
        }

        public string GetEmail()
        {
            var claims = GetClaimsIdentity();
            return claims?.FindFirst(ClaimTypes.Name)?.Value
                ?? claims?.FindFirst(ClaimTypes.Email)?.Value
                ?? claims?.FindFirst("preferred_username")?.Value
                ?? "System";
        }

        public string GetName()
        {
            var claims = GetClaimsIdentity();
            return claims?.FindFirst(ClaimTypes.Name)?.Value
                ?? claims?.FindFirst("name")?.Value
                ?? "System";
        }

        public bool IsAdmin()
        {
            var claims = GetClaimsIdentity();
            return string.Equals(claims?.FindFirst(ClaimTypes.Role)?.Value, "Admin", StringComparison.OrdinalIgnoreCase);
        }

        private ClaimsIdentity? GetClaimsIdentity()
        {
            return _httpContextAccessor.HttpContext?.User?.Identity as ClaimsIdentity;
        }
    }
}
