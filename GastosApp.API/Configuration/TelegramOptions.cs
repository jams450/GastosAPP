namespace GastosApp.API.Configuration;

public sealed class TelegramOptions
{
    public const string SectionName = "Telegram";

    public bool Enabled { get; set; }
    public string BotToken { get; set; } = "";
    public string WebhookSecret { get; set; } = "";
    public long AllowedUserId { get; set; }
    public int AppUserId { get; set; }
}
