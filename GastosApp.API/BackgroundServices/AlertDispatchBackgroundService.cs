using GastosApp.API.Configuration;
using GastosApp.API.Services.Jobs;
using Microsoft.Extensions.Options;

namespace GastosApp.API.BackgroundServices;

/// <summary>
/// Drena el outbox transaccional de alertas cada <c>Alerts:DispatchSeconds</c>, con cada corrida
/// registrada en el historial de jobs (S1/L5).
/// <para>
/// El drenaje en sí —expirar pendientes viejos, respetar <c>Telegram:Enabled</c>, procesar el lote con
/// reintentos y retroceso— vive en <see cref="Runners.AlertDispatchJobRunner"/> desde que el módulo de
/// monitoreo necesitó reutilizarlo. Este worker conserva su horario: corre al arrancar y luego espera
/// su intervalo.
/// </para>
/// <para>
/// Un solo contenedor <c>api</c>: el lote se procesa secuencialmente en este proceso, sin lock
/// distribuido.
/// </para>
/// </summary>
public sealed class AlertDispatchBackgroundService : BackgroundService
{
    private readonly IJobCoordinator _coordinator;
    private readonly AlertsOptions _alertsOptions;
    private readonly ILogger<AlertDispatchBackgroundService> _logger;

    public AlertDispatchBackgroundService(
        IJobCoordinator coordinator,
        IOptions<AlertsOptions> alertsOptions,
        ILogger<AlertDispatchBackgroundService> logger)
    {
        _coordinator = coordinator;
        _alertsOptions = alertsOptions.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_alertsOptions.Enabled)
        {
            _logger.LogInformation("Alert dispatch disabled (Alerts:Enabled=false).");
            return;
        }

        var interval = TimeSpan.FromSeconds(_alertsOptions.DispatchSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            await DispatchOnceAsync(stoppingToken);

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

    private async Task DispatchOnceAsync(CancellationToken stoppingToken)
    {
        try
        {
            await _coordinator.RunAutomaticAsync(JobKeys.AlertDispatch, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado ordenado: no es un error.
        }
        catch (Exception exception)
        {
            // Solo el tipo: nunca payload ni mensaje de excepción.
            _logger.LogError("Alert dispatch failed: {ErrorType}", exception.GetType().Name);
        }
    }
}
