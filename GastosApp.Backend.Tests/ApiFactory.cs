using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Boots the real <c>Program.cs</c> pipeline in memory, with no database and no network.
/// <para>
/// Only configuration is substituted. Everything the request under test touches — middleware order,
/// authentication, authorization, the controller and its exception handling — is the production
/// wiring, which is the point: a control asserted only against a hand-built service collection
/// proves nothing about what the application actually runs.
/// </para>
/// <para>
/// Configuration arrives through environment variables rather than
/// <c>builder.ConfigureAppConfiguration</c>. The API reads several keys while registering services
/// (the JWT key in <c>AddApiAuthentication</c>, the connection string in <c>AddApiDatabase</c>, the
/// CORS origins and the rate-limit budget), and a source added by the test factory is only merged
/// after <c>Program.cs</c> has already read them. Environment variables are part of the host
/// configuration that <c>WebApplicationBuilder</c> is constructed from, so they are visible from the
/// first line of the composition root. The process is this test assembly, so the values stay local.
/// </para>
/// <para>
/// The connection string points at a closed port so an accidental query fails immediately instead of
/// hanging; no test here depends on a successful query.
/// </para>
/// Test assembly only; derived by <see cref="UnattributedProbeFactory"/> to add a probe endpoint.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    /// <summary>Deliberately small so the limit is reached inside one test.</summary>
    public const int AuthPermitLimit = 3;

    public const string AuthPermitLimitValue = "3";

    static ApiFactory()
    {
        Set("Jwt__Key", "integration-probe-key-that-is-long-enough-32");
        Set("Jwt__Issuer", "GastosApp");
        Set("Jwt__Audience", "GastosAppUsers");
        Set("ConnectionStrings__DefaultConnection",
            "Host=127.0.0.1;Port=1;Database=unused;Username=unused;Password=unused;Timeout=1");
        Set("Cors__AllowedOrigins", "http://localhost:3000");
        Set("RateLimit__Auth__PermitLimit", AuthPermitLimitValue);
        Set("RateLimit__Auth__WindowSeconds", "60");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseEnvironment("Production");

    private static void Set(string key, string value) => Environment.SetEnvironmentVariable(key, value);
}
