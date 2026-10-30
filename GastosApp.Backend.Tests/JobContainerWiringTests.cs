using GastosApp.API.Extensions;
using GastosApp.API.Services.Jobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the container wiring that makes the five jobs reachable by key (S1/S3/L5).
/// <para>
/// The catalog can list a job whose adapter is missing, and that failure is invisible until someone
/// clicks run: a key listed but unrunnable. These checks also fix the lifetimes, because they are
/// the mechanism and not a detail: two coordinators would be two locks, so an automatic run and a
/// manual run of the same job would overlap again, and a per-request store would inherit the
/// <c>DbContext</c> of a request that already returned.
/// </para>
/// <para>
/// It lives apart from <see cref="JobRunnerAdapterTests"/> on purpose: the adapters' behavior and the
/// composition of the graph are two separate promises, and this one only changes when the DI
/// registration does.
/// </para>
/// </summary>
public class JobContainerWiringTests
{
    [Fact]
    public void The_container_registers_exactly_one_runner_per_catalog_key()
    {
        using var provider = Composition();
        using var scope = provider.CreateScope();

        var keys = scope.ServiceProvider.GetServices<IJobRunner>()
            .Select(runner => runner.JobKey)
            .OrderBy(key => key, StringComparer.Ordinal)
            .ToArray();

        Assert.Equal(JobKeys.All.OrderBy(key => key, StringComparer.Ordinal).ToArray(), keys);

        // Cada clave del catálogo tiene su runner: un job listado pero sin adaptador fallaría al
        // ejecutarse, y un adaptador sin clave sería código muerto.
        var catalog = provider.GetRequiredService<IJobCatalog>();
        Assert.All(catalog.Jobs, job => Assert.Contains(job.Key, keys));
    }

    [Fact]
    public void The_coordinator_and_the_execution_host_are_single_instances()
    {
        using var provider = Composition();

        // Dos coordinadores serían dos candados, y el solapamiento volvería.
        Assert.Same(provider.GetRequiredService<IJobCoordinator>(), provider.GetRequiredService<IJobCoordinator>());

        // El host que recibe el trabajo es el mismo que el host arranca y espera.
        var hosted = provider.GetServices<IHostedService>().OfType<JobExecutionHost>().ToArray();
        Assert.Single(hosted);
        Assert.Same(hosted[0], provider.GetRequiredService<IJobExecutionHost>());

        // La reconciliación de arranque está registrada: sin ella, un historial recién desplegado
        // seguiría mostrando corridas vivas que no existen.
        Assert.Single(provider.GetServices<IHostedService>().OfType<JobMonitoringStartupService>());
    }

    [Fact]
    public void The_catalog_is_a_singleton_and_the_run_query_is_per_request()
    {
        using var provider = Composition();

        Assert.Same(provider.GetRequiredService<IJobCatalog>(), provider.GetRequiredService<IJobCatalog>());

        using var first = provider.CreateScope();
        using var second = provider.CreateScope();

        Assert.NotSame(
            first.ServiceProvider.GetRequiredService<IJobRunQueryService>(),
            second.ServiceProvider.GetRequiredService<IJobRunQueryService>());
    }

    /// <summary>
    /// The same extensions <c>Program.cs</c> calls, minus authentication and CORS, which these
    /// services do not touch. The connection string points at a closed port: building the graph must
    /// not need a database, and nothing here queries one.
    /// </summary>
    private static ServiceProvider Composition()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] =
                    "Host=127.0.0.1;Port=1;Database=unused;Username=unused;Password=unused;Timeout=1"
            })
            .Build();

        var services = new ServiceCollection();

        services.AddLogging();
        services.AddApiHttpContext();
        // El clasificador de correo comparte el proveedor de LLM que registra Telegram; sin esa
        // extensión el grafo de los cinco jobs no se puede construir.
        services.AddApiTelegramConfiguration(configuration);
        services.AddApiAlertsConfiguration(configuration);
        services.AddApiFxConfiguration(configuration);
        services.AddApiEmailConfiguration(configuration);
        services.AddApiDatabase(configuration);
        services.AddApiApplicationServices();

        return services.BuildServiceProvider();
    }
}
