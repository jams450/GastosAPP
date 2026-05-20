using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;

namespace GastosApp.API.Extensions;

public static class AuthorizationExtensions
{
    public static IServiceCollection AddApiAuthorization(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.AddPolicy("UserWithId", policy =>
                policy.RequireAuthenticatedUser()
                    .RequireAssertion(HasValidUserId));

            options.AddPolicy("AdminWithId", policy =>
                policy.RequireAuthenticatedUser()
                    .RequireRole("Admin")
                    .RequireAssertion(HasValidUserId));
        });

        return services;
    }

    private static bool HasValidUserId(AuthorizationHandlerContext context)
    {
        var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

        return int.TryParse(userIdClaim, out var userId) && userId >= 0;
    }
}
