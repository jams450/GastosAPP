using GastosApp.API.Configuration;
using GastosApp.BusinessLogic.Models.Budgets;

namespace GastosApp.API.Extensions;

public static class AlertsConfigurationExtensions
{
    public static IServiceCollection AddApiAlertsConfiguration(this IServiceCollection services, IConfiguration configuration)
    {
        var alertsSection = configuration.GetSection(AlertsOptions.SectionName);
        var alertsEnabled = alertsSection.GetValue<bool>(nameof(AlertsOptions.Enabled));

        // Ajuste de evaluación de presupuesto para BusinessLogic. Se registra aquí porque este
        // método sí recibe IConfiguration y BusinessLogic no usa IOptions: un POCO inmutable
        // (singleton) evita añadir paquetes y mantiene la configuración fuera del dominio.
        // Default false: con el interruptor apagado el umbral depende solo del gasto ejecutado y
        // el comportamiento de Fase 2 no cambia, aunque existan partidas planificadas.
        services.AddSingleton(new BudgetEvaluationSettings
        {
            CommittedCountsEnabled = configuration.GetValue("Alerts:CommittedCountsEnabled", false),

            // Default false (plan §6.4 regla 4: "las alertas de partida nacen apagadas"). Apaga las
            // TRES alertas de partida — due_today, overdue y unexecuted_month_end —, no solo el cierre
            // de mes: §6.2 las pone a las tres detrás de esta misma clave. El nombre es el literal que
            // fija §6.4; el alcance es el de §6.2. Con el interruptor apagado no se lee ninguna partida
            // y el comportamiento previo queda intacto.
            UnexecutedAlertEnabled = configuration.GetValue("Alerts:UnexecutedAlertEnabled", false)
        });

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
