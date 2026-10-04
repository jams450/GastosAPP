using GastosApp.AI.Configuration;
using GastosApp.API.Configuration;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.BusinessLogic.Models.Recurring;

namespace GastosApp.API.Extensions;

public static class TelegramConfigurationExtensions
{
    public static IServiceCollection AddApiTelegramConfiguration(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<GastosApp.API.Services.Telegram.TelegramConversationService>();
        var telegramSection = configuration.GetSection(TelegramOptions.SectionName);
        var llmSection = configuration.GetSection(LlmOptions.SectionName);
        var telegramEnabled = telegramSection.GetValue<bool>(nameof(TelegramOptions.Enabled));

        var telegramOptions = services.AddOptions<TelegramOptions>()
            .Bind(telegramSection);

        // Ajustes de programados para BusinessLogic. Se registran aquí porque este método sí recibe
        // IConfiguration y BusinessLogic no usa IOptions: un POCO inmutable (singleton) evita añadir
        // paquetes y mantiene la configuración fuera del dominio.
        // TelegramAlertingAvailable es la única condición que habilita autoExecute (sección 7.4):
        // se resuelve aquí para que el guardado y el motor compartan la misma decisión sin que el
        // dominio vea el token. Nunca expone el token ni un chat_id, solo el veredicto.
        services.AddSingleton(new RecurringItemSettings
        {
            AverageMonths = configuration.GetValue("Plan:AverageMonths", 3),
            TelegramAlertingAvailable =
                telegramSection.GetValue<bool>(nameof(TelegramOptions.Enabled)) &&
                !IsPlaceholder(telegramSection.GetValue<string>(nameof(TelegramOptions.BotToken)) ?? string.Empty) &&
                telegramSection.GetValue<long>(nameof(TelegramOptions.AllowedUserId)) > 0
        });

        // Tolerancia del matching de partidas (sección 4.4). Es la única lectora de
        // Plan:MatchTolerancePct: se movió aquí desde RecurringItemSettings, donde ya no se usaba,
        // para no dejar dos superficies de configuración para la misma clave. Se registra junto a
        // las demás POCOs de Plan: por la misma razón que las de arriba.
        // Default 0 = coincidencia exacta, el valor que el plan propone; no se sobrescribe en
        // appsettings.* a propósito.
        services.AddSingleton(new PlanMatchSettings
        {
            MatchTolerancePct = configuration.GetValue("Plan:MatchTolerancePct", 0m)
        });

        // LlmOptions se enlaza sin validación de arranque: un LLM inválido/caído nunca debe
        // bloquear el arranque ni los comandos manuales. La usabilidad se verifica en tiempo de ejecución.
        services.AddOptions<LlmOptions>()
            .Bind(llmSection);

        if (telegramEnabled)
        {
            telegramOptions
                .Validate(options => !IsPlaceholder(options.BotToken), "Telegram:BotToken must be configured with a non-placeholder value.")
                .Validate(options => !IsPlaceholder(options.WebhookSecret), "Telegram:WebhookSecret must be configured with a non-placeholder value.")
                .Validate(options => options.AllowedUserId > 0, "Telegram:AllowedUserId must be greater than zero.")
                .Validate(options => options.AppUserId > 0, "Telegram:AppUserId must be greater than zero.")
                .ValidateOnStart();
        }

        return services;
    }

    /// <summary>
    /// Indica si la configuración del LLM es utilizable. Si no lo es, el extractor queda
    /// deshabilitado y el texto libre responde un mensaje genérico.
    /// </summary>
    public static bool IsLlmUsable(LlmOptions options) =>
        !IsPlaceholder(options.BaseUrl) &&
        Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out _) &&
        !IsPlaceholder(options.ApiKey) &&
        !IsPlaceholder(options.Model);

    private static bool IsPlaceholder(string value) =>
        string.IsNullOrWhiteSpace(value) || value.StartsWith("SET_", StringComparison.OrdinalIgnoreCase);
}
