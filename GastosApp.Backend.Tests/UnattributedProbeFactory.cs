using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace GastosApp.Backend.Tests;

/// <summary>
/// The real application plus one deliberately unprotected endpoint.
/// <para>
/// Without this part the probe would 404 and the test would pass for the wrong reason: a missing
/// route is not the same fact as a refused request.
/// </para>
/// </summary>
public sealed class UnattributedProbeFactory : ApiFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);

        builder.ConfigureServices(services =>
            services.AddControllers().AddApplicationPart(typeof(UnattributedProbeController).Assembly));
    }
}
