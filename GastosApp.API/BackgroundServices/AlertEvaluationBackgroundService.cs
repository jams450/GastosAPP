using GastosApp.API.Configuration;
using GastosApp.BusinessLogic.Interfaces;
using Microsoft.Extensions.Options;

namespace GastosApp.API.BackgroundServices;

/// <summary>
/// Evalúa los umbrales de presupuesto del usuario de Telegram cada
/// <c>Alerts:EvaluationIntervalMinutes</c> y una vez al arrancar. La idempotencia del
/// servicio decide: repetir la corrida no duplica entregas.
/// No usa <c>HttpContext</c>: crea un scope por iteración.
/// </summary>
public sealed class AlertEvaluationBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly AlertsOptions _alertsOptions;
    private readonly TelegramOptions _telegramOptions;
    private readonly ILogger<AlertEvaluationBackgroundService> _logger;

    public AlertEvaluationBackgroundService(
        IServiceScopeFactory scopeFactory,
        IOptions<AlertsOptions> alertsOptions,
        IOptions<TelegramOptions> telegramOptions,
        ILogger<AlertEvaluationBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
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
            try
            {
                await EvaluateOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                // Solo el tipo: nunca montos, payload ni mensaje de excepción.
                _logger.LogError("Alert evaluation failed: {ErrorType}", exception.GetType().Name);
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

    private async Task EvaluateOnceAsync(CancellationToken cancellationToken)
    {
        // Alcance estricto: únicamente el AppUserId configurado en TelegramOptions.
        if (_telegramOptions.AppUserId <= 0)
        {
            _logger.LogDebug("Alert evaluation skipped: Telegram:AppUserId is not configured.");
            return;
        }

        using var scope = _scopeFactory.CreateScope();
        var evaluationService = scope.ServiceProvider.GetRequiredService<IAlertEvaluationService>();

        var result = await evaluationService.EvaluateAsync(_telegramOptions.AppUserId, cancellationToken);

        if (result.AlertsCreated > 0)
        {
            _logger.LogInformation(
                "Alert evaluation created {Created} deliveries for period {PeriodKey}.",
                result.AlertsCreated,
                result.PeriodKey);
        }
    }
}
