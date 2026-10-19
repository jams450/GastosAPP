using GastosApp.API.Extensions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins CORS configuration handling for S4.
/// <para>
/// The old fallback was unconditional: with <c>Cors:AllowedOrigins</c> missing, the API silently
/// allowed <c>http://localhost:3000</c> in every environment. In production that is a silent
/// misconfiguration — the real frontend origin is simply rejected, with no signal that the setting
/// never arrived, and the only clue is a browser console error.
/// </para>
/// <para>
/// Asserted against the registration method rather than a live host so the check is isolated and
/// cannot be disturbed by process-wide environment variables.
/// </para>
/// </summary>
public class CorsConfigurationTests
{
    [Fact]
    public void Production_without_origins_fails_at_startup()
    {
        var exception = Assert.Throws<InvalidOperationException>(() => AddCors("Production", null));

        Assert.Contains("Cors:AllowedOrigins", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Production_with_an_empty_origin_list_fails_at_startup()
    {
        Assert.Throws<InvalidOperationException>(() => AddCors("Production", " , ,, "));
    }

    [Theory]
    [InlineData("http://localhost:3000/")]   // trailing slash: CORS matches the exact string
    [InlineData("localhost:3000")]           // no scheme
    [InlineData("http://localhost:3000/api")] // a path is not part of an origin
    [InlineData("*")]                        // invalid with AllowCredentials
    [InlineData("ftp://localhost")]          // not an http origin
    [InlineData("http://user@localhost:3000")] // userinfo is not part of an origin
    [InlineData("HTTPS://LOCALHOST:3000")]   // browsers serialise the origin lowercase
    [InlineData("https://LocalHost:3000")]
    public void Malformed_origins_fail_at_startup_in_every_environment(string origin)
    {
        Assert.Throws<InvalidOperationException>(() => AddCors("Production", origin));
        Assert.Throws<InvalidOperationException>(() => AddCors("Development", origin));
    }

    [Fact]
    public void Development_without_origins_keeps_the_local_fallback()
    {
        // Local `dotnet run` has no need for an explicit origin list, and this convenience is the
        // only reason the fallback existed.
        var services = AddCors("Development", null);

        Assert.Contains(services, descriptor => descriptor.ServiceType.Name.Contains("Cors", StringComparison.Ordinal));
    }

    private static IServiceCollection AddCors(string environmentName, string? allowedOrigins)
    {
        var settings = new Dictionary<string, string?>
        {
            ["ASPNETCORE_ENVIRONMENT"] = environmentName,
        };

        if (allowedOrigins is not null)
        {
            settings["Cors:AllowedOrigins"] = allowedOrigins;
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var services = new ServiceCollection();

        services.AddApiCors(configuration, new ProbeEnvironment(environmentName));

        return services;
    }

    private sealed class ProbeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "GastosApp.Backend.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
