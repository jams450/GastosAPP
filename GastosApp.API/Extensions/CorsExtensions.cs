using Microsoft.Extensions.Hosting;

namespace GastosApp.API.Extensions;

public static class CorsExtensions
{
    /// <summary>Origin used by local development when no origin list is configured.</summary>
    private const string LocalDevelopmentOrigin = "http://localhost:3000";

    private const string OriginsKey = "Cors:AllowedOrigins";

    public static IServiceCollection AddApiCors(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var allowedOrigins = ReadOrigins(configuration);

        if (allowedOrigins.Length == 0)
        {
            // The fallback used to apply in every environment. In production that is a silent
            // failure: the API starts, then rejects the real frontend origin, and the only signal is
            // a browser console error. Failing at startup turns a confusing runtime symptom into an
            // unmissable deployment error.
            if (environment.IsProduction())
            {
                throw new InvalidOperationException(
                    $"{OriginsKey} must list at least one origin when the environment is Production. "
                    + "Refusing to start with the local-development fallback.");
            }

            allowedOrigins = [LocalDevelopmentOrigin];
        }

        services.AddCors(options =>
        {
            options.AddPolicy("Production", policy =>
            {
                policy.WithOrigins(allowedOrigins)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });
        });

        return services;
    }

    /// <summary>
    /// Reads the origin list. Both shapes are supported because both are in use: the indexed section
    /// (<c>Cors:AllowedOrigins:0</c>) and the comma-separated scalar that Docker Compose passes as
    /// <c>Cors__AllowedOrigins</c>.
    /// </summary>
    private static string[] ReadOrigins(IConfiguration configuration)
    {
        var fromSection = configuration.GetSection(OriginsKey).Get<string[]>();

        var origins = (fromSection is { Length: > 0 } ? fromSection : Split(configuration[OriginsKey]))
            .Where(origin => !string.IsNullOrWhiteSpace(origin))
            .Select(origin => origin.Trim())
            .ToArray();

        foreach (var origin in origins)
        {
            if (!IsValidOrigin(origin))
            {
                // Not environment-dependent: a malformed origin never works, it only fails silently.
                throw new InvalidOperationException(
                    $"{OriginsKey} contains an invalid origin '{origin}'. An origin is scheme://host[:port] with "
                    + "no trailing slash, path, query or fragment, because CORS compares the exact string.");
            }
        }

        return origins;
    }

    private static bool IsValidOrigin(string origin)
    {
        // A trailing slash is the classic mistake: "http://host:3000/" never matches the browser's
        // "http://host:3000".
        if (origin.EndsWith('/'))
        {
            return false;
        }

        // Browsers serialise the origin with a lowercase scheme and host, and CORS compares the exact
        // string. An uppercase origin passes a URI check but never matches, which would be silent
        // dead configuration in Production: exactly the symptom this validator exists to remove.
        if (!string.Equals(origin, origin.ToLowerInvariant(), StringComparison.Ordinal))
        {
            return false;
        }

        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }

        // "http://user@host" is a URI with credentials, not an origin.
        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            return false;
        }

        return uri.AbsolutePath == "/"
            && string.IsNullOrEmpty(uri.Query)
            && string.IsNullOrEmpty(uri.Fragment);
    }

    private static string[] Split(string? raw) =>
        string.IsNullOrWhiteSpace(raw)
            ? []
            : raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
