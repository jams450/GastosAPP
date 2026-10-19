using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using GastosApp.API.Security;
using Microsoft.AspNetCore.Authorization;

namespace GastosApp.API.Extensions;

public static class AuthorizationExtensions
{
    public static IServiceCollection AddApiAuthorization(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            // Fail-closed default. Every controller in the application carries an explicit attribute
            // today, but that was a convention rather than a mechanism: with no fallback policy, a
            // controller added without one would have been silently public. Requiring an
            // authenticated user here means the safe case is what happens when someone forgets.
            // Endpoints that must stay public say so with [AllowAnonymous].
            options.FallbackPolicy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .Build();

            options.AddPolicy("UserWithId", policy =>
                policy.RequireAuthenticatedUser()
                    .RequireAssertion(HasValidUserId));

            options.AddPolicy("AdminWithId", policy =>
                policy.RequireAuthenticatedUser()
                    .RequireRole(ClaimNames.AdminRole)
                    .RequireAssertion(HasValidUserId));
        });

        return services;
    }

    private static bool HasValidUserId(AuthorizationHandlerContext context)
    {
        var userIdClaim = context.User.FindFirst(ClaimNames.NameIdentifier)?.Value
            ?? context.User.FindFirst(ClaimNames.Subject)?.Value
            ?? context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

        return int.TryParse(userIdClaim, out var userId) && userId > 0;
    }
}
