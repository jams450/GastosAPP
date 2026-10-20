using GastosApp.API.Configuration;
using GastosApp.API.Services.Fx;

namespace GastosApp.API.Extensions;

public static class FxConfigurationExtensions
{
    /// <summary>
    /// Registra los proveedores de tipo de cambio y su selección por divisa.
    /// <para>
    /// Ninguna opción se valida al arrancar: un Banxico sin token o caído no debe impedir que la app
    /// levante. La falta de tasa se resuelve en tiempo de ejecución, y el job la reporta.
    /// </para>
    /// </summary>
    public static IServiceCollection AddApiFxConfiguration(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<BanxicoOptions>().Bind(configuration.GetSection(BanxicoOptions.SectionName));
        services.AddOptions<FrankfurterOptions>().Bind(configuration.GetSection(FrankfurterOptions.SectionName));

        // RemoveAllLoggers: ni el token ni la respuesta del proveedor deben llegar al log por esta vía.
        services.AddHttpClient<BanxicoFxRateProvider>(client => client.Timeout = TimeSpan.FromSeconds(20))
            .RemoveAllLoggers();
        services.AddHttpClient<FrankfurterFxRateProvider>(client => client.Timeout = TimeSpan.FromSeconds(20))
            .RemoveAllLoggers();

        services.AddScoped<FxRateProviderRouter>();

        return services;
    }
}
