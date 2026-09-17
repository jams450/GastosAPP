using GastosApp.API.Configuration;

namespace GastosApp.API.Extensions;

public static class AlertsConfigurationExtensions
{
    public static IServiceCollection AddApiAlertsConfiguration(this IServiceCollection services, IConfiguration configuration)
    {
        var alertsSection = configuration.GetSection(AlertsOptions.SectionName);
        var alertsEnabled = alertsSection.GetValue<bool>(nameof(AlertsOptions.Enabled));

        var alertsOptions = services.AddOptions<AlertsOptions>()
            .Bind(alertsSection);

        // Fail-fast solo si los workers están habilitados: un valor inválido en un despliegue
        // con alertas apagadas nunca debe bloquear el arranque del API.
        if (alertsEnabled)
        {
            alertsOptions
                .Validate(options => options.EvaluationIntervalMinutes > 0, "Alerts:EvaluationIntervalMinutes must be greater than zero.")
                .Validate(options => options.DispatchSeconds > 0, "Alerts:DispatchSeconds must be greater than zero.")
                .Validate(options => options.BatchSize > 0, "Alerts:BatchSize must be greater than zero.")
                .Validate(options => options.MaxAttempts > 0, "Alerts:MaxAttempts must be greater than zero.")
                .ValidateOnStart();
        }

        return services;
    }
}
