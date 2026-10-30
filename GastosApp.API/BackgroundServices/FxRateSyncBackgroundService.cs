using GastosApp.API.Configuration;
using GastosApp.API.Services.Fx;
using GastosApp.API.Services.Jobs;
using Microsoft.Extensions.Options;

namespace GastosApp.API.BackgroundServices;

/// <summary>
/// Sincroniza una vez al arrancar y luego todos los días a <c>FxRates:SyncHourUtc</c>, registrando
/// cada corrida en el historial de jobs (S1/L5).
/// <para>
/// La corrida de arranque no es un accidente: si el proceso estuvo caído varios días, es la que recupera
/// el hueco. Es segura porque <see cref="FxRateWritePolicy"/> solo escribe fechas nuevas, así que repetir
/// la corrida no duplica ni sobrescribe.
/// </para>
/// <para>
/// El horario no cambia: lo único nuevo es que la pasada la ejecuta el coordinador, que comparte el
/// candado con la corrida manual para que no se solapen.
/// </para>
/// </summary>
public sealed class FxRateSyncBackgroundService : BackgroundService
{
    private readonly IJobCoordinator _coordinator;
    private readonly FxRateSyncOptions _options;
    private readonly ILogger<FxRateSyncBackgroundService> _logger;

    public FxRateSyncBackgroundService(
        IJobCoordinator coordinator,
        IOptions<FxRateSyncOptions> options,
        ILogger<FxRateSyncBackgroundService> logger)
    {
        _coordinator = coordinator;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            _logger.LogInformation("FX rate sync disabled (FxRates:Enabled=false).");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            await SyncOnceAsync(stoppingToken);

            var delay = FxSyncSchedule.DelayUntilNextRun(DateTimeOffset.UtcNow, _options.SyncHourUtc);

            try
            {
                await Task.Delay(delay, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task SyncOnceAsync(CancellationToken stoppingToken)
    {
        try
        {
            await _coordinator.RunAutomaticAsync(JobKeys.FxRateSync, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado ordenado: no es un error.
        }
        catch (Exception exception)
        {
            // El coordinador ya registra el fallo en el historial; esta barrera evita que una
            // excepción escape de un BackgroundService y detenga el host.
            _logger.LogError("FX rate sync failed: {ErrorType}", exception.GetType().Name);
        }
    }
}
