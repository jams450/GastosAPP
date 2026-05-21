using System.Text;
using GastosApp.API.Security;
using GastosApp.BusinessLogic.Context;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace GastosApp.API.Extensions;

public static class AuthenticationExtensions
{
    public static IServiceCollection AddApiAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        var jwtKey = configuration["Jwt:Key"]
            ?? throw new InvalidOperationException("JWT Key not configured in appsettings.json");

        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = configuration["Jwt:Issuer"],
                    ValidAudience = configuration["Jwt:Audience"],
                    IssuerSigningKey = securityKey,
                    ClockSkew = TimeSpan.Zero
                };

                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = async context =>
                    {
                        var userIdClaim = context.Principal?.FindFirst(ClaimNames.NameIdentifier)?.Value
                            ?? context.Principal?.FindFirst(ClaimNames.Subject)?.Value;

                        if (!int.TryParse(userIdClaim, out var userId) || userId < 0)
                        {
                            context.Fail("Invalid user id claim.");
                            return;
                        }

                        if (userId == 0)
                        {
                            return;
                        }

                        var sessionVersionClaim = context.Principal?.FindFirst(ClaimNames.SessionVersion)?.Value;
                        if (!int.TryParse(sessionVersionClaim, out var tokenSessionVersion))
                        {
                            context.Fail("Missing or invalid sessionVersion claim.");
                            return;
                        }

                        var db = context.HttpContext.RequestServices.GetRequiredService<ContextSqlGastos>();

                        var user = await db.Users
                            .AsNoTracking()
                            .FirstOrDefaultAsync(u => u.UserId == userId);

                        if (user == null || !user.Active || (user.LockedUntil.HasValue && user.LockedUntil.Value > DateTime.UtcNow))
                        {
                            context.Fail("User is inactive or locked.");
                            return;
                        }

                        if (user.SessionVersion != tokenSessionVersion)
                        {
                            context.Fail("Token session version is no longer valid.");
                            return;
                        }

                        var sidClaim = context.Principal?.FindFirst(ClaimNames.SessionId)?.Value;
                        if (string.IsNullOrWhiteSpace(sidClaim))
                        {
                            context.Fail("Missing session id claim.");
                            return;
                        }

                        if (!Guid.TryParse(sidClaim, out var sessionId))
                        {
                            context.Fail("Invalid session id claim.");
                            return;
                        }

                        var session = await db.UserSessions
                            .AsNoTracking()
                            .FirstOrDefaultAsync(s => s.SessionId == sessionId && s.UserId == userId);

                        if (session == null || session.RevokedAt.HasValue || session.ExpiresAt <= DateTime.UtcNow)
                        {
                            context.Fail("Session is revoked or expired.");
                        }
                    }
                };
            });

        return services;
    }
}
