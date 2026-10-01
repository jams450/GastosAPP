using GastosApp.API.Configuration;
using GastosApp.BusinessLogic.Interfaces;
using Microsoft.Extensions.Options;

namespace GastosApp.API.BackgroundServices;

/// <summary>
/// Motor de ejecución automática de gastos programados. Hereda la cadencia de
/// <c>Alerts:EvaluationIntervalMinutes</c> y el alcance single-user de <c>TelegramOptions.AppUserId</c>.
/// <para>
/// El ciclo es idempotente y seguro de correr dos veces: la guardia real es la partida en
/// <c>status='executed'</c>, no un lock del proceso. Sin Hangfire, sin Quartz, sin cron.
/// </para>
/// <para>
/// Nunca usa <c>HttpContext</c>: crea un scope por iteración. Los logs solo llevan ids, estados y
/// conteos: jamás montos, nombres de plantilla ni payload.
/// </para>
/// </summary>
public sealed class RecurringExecutionBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly AlertsOptions _alertsOptions;
    private readonly TelegramOptions _telegramOptions;
    private readonly ILogger<RecurringExecutionBackgroundService> _logger;

    public RecurringExecutionBackgroundService(
        IServiceScopeFactory scopeFactory,
        IOptions<AlertsOptions> alertsOptions,
        IOptions<TelegramOptions> telegramOptions,
        ILogger<RecurringExecutionBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
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
            try
            {
                await ExecuteOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                // Solo el tipo: nunca montos, payload ni mensaje de excepción.
                _logger.LogError("Recurring execution failed: {ErrorType}", exception.GetType().Name);
            }

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

    private async Task ExecuteOnceAsync(CancellationToken cancellationToken)
    {
        // Alcance estricto: únicamente el AppUserId configurado, igual que el evaluador de presupuesto.
        if (_telegramOptions.AppUserId <= 0)
        {
            _logger.LogDebug("Recurring execution skipped: Telegram:AppUserId is not configured.");
            return;
        }

        using var scope = _scopeFactory.CreateScope();
        var recurringItemService = scope.ServiceProvider.GetRequiredService<IRecurringItemService>();

        // La decisión de no ejecutar sin salida de Telegram (secciones 4.6 regla 3-bis y 7.4) la toma
        // el servicio: es la misma validación que aplica al guardado, y no debe duplicarse aquí.
        var result = await recurringItemService.ExecuteDueAsync(
            _telegramOptions.AppUserId,
            nowUtc: null,
            cancellationToken);

        if (result.ExecutionSkipped)
        {
            _logger.LogDebug("Recurring execution skipped: Telegram alerting is not available.");
            return;
        }

        if (result.Executed > 0 || result.Materialized > 0)
        {
            _logger.LogInformation(
                "Recurring execution: period {PeriodKey}, materialized {Materialized}, executed {Executed}, notices {Notices}.",
                result.PeriodKey,
                result.Materialized,
                result.Executed,
                result.NoticesQueued);
        }
    }
}
