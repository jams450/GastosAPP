using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Email;
using GastosApp.BusinessLogic.Services;

namespace GastosApp.API.Extensions;

public static class EmailConfigurationExtensions
{
    public static IServiceCollection AddApiEmailConfiguration(this IServiceCollection services, IConfiguration configuration)
    {
        // Se enlaza sin validación de arranque a propósito: una sección Email incompleta no debe
        // bloquear el arranque de la API. Misma regla que LlmOptions; el clasificador simplemente
        // usa los valores por defecto.
        services.AddOptions<EmailClassifierOptions>()
            .Bind(configuration.GetSection(EmailClassifierOptions.SectionName));

        services.AddScoped<IEmailLabelService, EmailLabelService>();
        services.AddScoped<IEmailRuleService, EmailRuleService>();
        services.AddScoped<IEmailClassificationService, EmailClassificationService>();

        return services;
    }
}
