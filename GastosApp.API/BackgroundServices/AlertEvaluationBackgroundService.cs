using GastosApp.API.Configuration;
using GastosApp.API.Services.Jobs;
using Microsoft.Extensions.Options;

namespace GastosApp.API.BackgroundServices;

/// <summary>
/// Evalúa los umbrales de presupuesto del usuario de Telegram cada
/// <c>Alerts:EvaluationIntervalMinutes</c> y una vez al arrancar, registrando cada corrida en el
/// historial (S1/L5). La idempotencia del servicio decide: repetir la corrida no duplica entregas.
/// <para>
/// El horario, el interruptor <c>Alerts:Enabled</c> y la guarda de dueño no cambian; la corrida la
/// ejecuta el coordinador, que la abre en el historial antes de trabajar y la rechaza si ya hay otra
/// en curso (manual incluida).
/// </para>
/// </summary>
public sealed class AlertEvaluationBackgroundService : BackgroundService
{
    private readonly IJobCoordinator _coordinator;
    private readonly AlertsOptions _alertsOptions;
    private readonly TelegramOptions _telegramOptions;
    private readonly ILogger<AlertEvaluationBackgroundService> _logger;

    public AlertEvaluationBackgroundService(
        IJobCoordinator coordinator,
        IOptions<AlertsOptions> alertsOptions,
        IOptions<TelegramOptions> telegramOptions,
        ILogger<AlertEvaluationBackgroundService> logger)
    {
        _coordinator = coordinator;
        _alertsOptions = alertsOptions.Value;
        _telegramOptions = telegramOptions.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_alertsOptions.Enabled)
        {
            _logger.LogInformation("Alert evaluation disabled (Alerts:Enabled=false).");
            return;
        }

        var interval = TimeSpan.FromMinutes(_alertsOptions.EvaluationIntervalMinutes);

        while (!stoppingToken.IsCancellationRequested)
        {
            await EvaluateOnceAsync(stoppingToken);

            try
            {
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task EvaluateOnceAsync(CancellationToken stoppingToken)
    {
        // Alcance estricto: únicamente el AppUserId configurado en TelegramOptions.
        if (_telegramOptions.AppUserId <= 0)
        {
            _logger.LogDebug("Alert evaluation skipped: Telegram:AppUserId is not configured.");
            return;
        }

        try
        {
            await _coordinator.RunAutomaticAsync(JobKeys.AlertEvaluation, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado ordenado: no es un error.
        }
        catch (Exception exception)
        {
            // Solo el tipo: nunca montos, payload ni mensaje de excepción.
            _logger.LogError("Alert evaluation failed: {ErrorType}", exception.GetType().Name);
        }
    }
}
