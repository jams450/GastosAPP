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
        var llmOptions = services.AddOptions<LlmOptions>()
            .Bind(llmSection);

        if (telegramEnabled)
        {
            telegramOptions
                .Validate(options => !IsPlaceholder(options.BotToken), "Telegram:BotToken must be configured with a non-placeholder value.")
                .Validate(options => !IsPlaceholder(options.WebhookSecret), "Telegram:WebhookSecret must be configured with a non-placeholder value.")
                .Validate(options => options.AllowedUserId > 0, "Telegram:AllowedUserId must be greater than zero.")
                .Validate(options => options.AppUserId > 0, "Telegram:AppUserId must be greater than zero.")
                .ValidateOnStart();

            llmOptions
                .Validate(options => !IsPlaceholder(options.BaseUrl), "Llm:BaseUrl must be configured with a non-placeholder value.")
                .Validate(options => !IsPlaceholder(options.ApiKey), "Llm:ApiKey must be configured with a non-placeholder value.")
                .Validate(options => !IsPlaceholder(options.Model), "Llm:Model must be configured with a non-placeholder value.")
                .ValidateOnStart();
        }

        return services;
    }

    private static bool IsPlaceholder(string value) =>
        string.IsNullOrWhiteSpace(value) || value.StartsWith("SET_", StringComparison.OrdinalIgnoreCase);
}
