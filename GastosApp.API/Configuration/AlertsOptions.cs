namespace GastosApp.API.Configuration;

/// <summary>
/// Configuración de los workers de alertas. No contiene secretos: el destino de Telegram
/// vive en <see cref="TelegramOptions"/>.
/// </summary>
public sealed class AlertsOptions
{
    public const string SectionName = "Alerts";

    public bool Enabled { get; set; }
    public int EvaluationIntervalMinutes { get; set; } = 60;
    public int DispatchSeconds { get; set; } = 30;
    public int BatchSize { get; set; } = 20;
    public int MaxAttempts { get; set; } = 5;
}
