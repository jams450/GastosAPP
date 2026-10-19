using System.Threading.RateLimiting;
using GastosApp.API.Configuration;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GastosApp.API.Extensions;

public static class RateLimitingExtensions
{
    /// <summary>Policy name applied to the authentication endpoints.</summary>
    public const string AuthPolicy = "auth";

    /// <summary>
    /// Bucket used when the peer address is unavailable (in-process test hosts, some socket
    /// transports). Callers that cannot be told apart share one budget, which is the safe direction.
    /// </summary>
    private const string UnknownClientKey = "unknown";

    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var auth = ReadAuthOptions(configuration);

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            options.AddPolicy(AuthPolicy, httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: ResolveClientKey(httpContext),
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = auth.EffectivePermitLimit,
                        Window = auth.EffectiveWindow,
                        QueueLimit = 0,
                        AutoReplenishment = true
                    }));

            // A bare 429 with an empty body gives a client nothing to act on. This matches the
            // ProblemDetails shape the global exception handler already returns.
            options.OnRejected = async (context, cancellationToken) =>
            {
                var response = context.HttpContext.Response;
                if (response.HasStarted)
                {
                    return;
                }

                response.StatusCode = StatusCodes.Status429TooManyRequests;
                response.ContentType = "application/problem+json";

                await response.WriteAsJsonAsync(
                    new ProblemDetails
                    {
                        Status = StatusCodes.Status429TooManyRequests,
                        Title = "Demasiadas solicitudes",
                        Detail = "Espere un momento antes de intentar de nuevo."
                    },
                    cancellationToken);
            };
        });

        return services;
    }

    private static AuthRateLimitOptions ReadAuthOptions(IConfiguration configuration) =>
        new()
        {
            PermitLimit = configuration.GetValue(AuthRateLimitOptions.PermitLimitKey, AuthRateLimitOptions.DefaultPermitLimit),
            WindowSeconds = configuration.GetValue(AuthRateLimitOptions.WindowSecondsKey, AuthRateLimitOptions.DefaultWindowSeconds)
        };

    /// <summary>
    /// Partitions by peer address.
    /// <para>
    /// Behind the production reverse proxy this address is the proxy's, so every caller shares one
    /// bucket. That is deliberate and is the safe direction: honouring <c>X-Forwarded-For</c> without
    /// a configured <c>ForwardedHeaders</c> middleware that trusts only the known proxy would let any
    /// caller choose their own partition and bypass the limit completely. Collapsing to one bucket
    /// degrades to a global login throttle, which for this single-user application is still the
    /// intended protection.
    /// </para>
    /// </summary>
    private static string ResolveClientKey(HttpContext httpContext) =>
        httpContext.Connection.RemoteIpAddress?.ToString() ?? UnknownClientKey;
}
