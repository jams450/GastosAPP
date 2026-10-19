using Microsoft.AspNetCore.Hosting;

namespace GastosApp.Backend.Tests;

/// <summary>
/// The real pipeline in Development, where the API additionally maps its OpenAPI document.
/// </summary>
public sealed class DevelopmentApiFactory : ApiFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseEnvironment("Development");
    }
}
