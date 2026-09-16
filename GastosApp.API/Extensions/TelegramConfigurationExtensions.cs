using GastosApp.AI.Configuration;
using GastosApp.API.Configuration;

namespace GastosApp.API.Extensions;

public static class TelegramConfigurationExtensions
{
    public static IServiceCollection AddApiTelegramConfiguration(this IServiceCollection services, IConfiguration configuration)
    {
        var telegramSection = configuration.GetSection(TelegramOptions.SectionName);
        var llmSection = configuration.GetSection(LlmOptions.SectionName);
        var telegramEnabled = telegramSection.GetValue<bool>(nameof(TelegramOptions.Enabled));

        var telegramOptions = services.AddOptions<TelegramOptions>()
            .Bind(telegramSection);

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
