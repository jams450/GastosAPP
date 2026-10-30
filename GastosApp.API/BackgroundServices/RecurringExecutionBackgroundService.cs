using GastosApp.API.Configuration;
using GastosApp.API.Services.Jobs;
using Microsoft.Extensions.Options;

namespace GastosApp.API.BackgroundServices;

/// <summary>
/// Motor de ejecución automática de gastos programados, con cada corrida registrada en el historial
/// de jobs (S1/L5). Hereda la cadencia de <c>Alerts:EvaluationIntervalMinutes</c> y el alcance
/// single-user de <c>TelegramOptions.AppUserId</c>.
/// <para>
/// El ciclo es idempotente y seguro de correr dos veces: la guardia real es la partida en
/// <c>status='executed'</c>, no un lock del proceso. Sin Hangfire, sin Quartz, sin cron.
/// </para>
/// <para>
/// Los logs solo llevan ids, estados y conteos: jamás montos, nombres de plantilla ni payload.
/// </para>
/// </summary>
public sealed class RecurringExecutionBackgroundService : BackgroundService
{
    private readonly IJobCoordinator _coordinator;
    private readonly AlertsOptions _alertsOptions;
    private readonly TelegramOptions _telegramOptions;
    private readonly ILogger<RecurringExecutionBackgroundService> _logger;

    public RecurringExecutionBackgroundService(
        IJobCoordinator coordinator,
        IOptions<AlertsOptions> alertsOptions,
        IOptions<TelegramOptions> telegramOptions,
        ILogger<RecurringExecutionBackgroundService> logger)
    {
        _coordinator = coordinator;
        _alertsOptions = alertsOptions.Value;
        _telegramOptions = telegramOptions.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Mismo interruptor que los otros dos workers: apagar Alerts:Enabled detiene también el motor.
        if (!_alertsOptions.Enabled)
        {
            _logger.LogInformation("Recurring execution disabled (Alerts:Enabled=false).");
            return;
        }

        var interval = TimeSpan.FromMinutes(_alertsOptions.EvaluationIntervalMinutes);

        while (!stoppingToken.IsCancellationRequested)
        {
            await ExecuteOnceAsync(stoppingToken);

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

    private async Task ExecuteOnceAsync(CancellationToken stoppingToken)
    {
        // Alcance estricto: únicamente el AppUserId configurado, igual que el evaluador de presupuesto.
        if (_telegramOptions.AppUserId <= 0)
        {
            _logger.LogDebug("Recurring execution skipped: Telegram:AppUserId is not configured.");
            return;
        }

        try
        {
            await _coordinator.RunAutomaticAsync(JobKeys.RecurringExecution, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado ordenado: no es un error.
        }
        catch (Exception exception)
        {
            // Solo el tipo: nunca montos, payload ni mensaje de excepción.
            _logger.LogError("Recurring execution failed: {ErrorType}", exception.GetType().Name);
        }
    }
}
