using GastosApp.API.Configuration;
using GastosApp.API.Services.Fx;
using GastosApp.BusinessLogic.Interfaces;
using Microsoft.Extensions.Options;

namespace GastosApp.API.BackgroundServices;

/// <summary>
/// Sincroniza una vez al arrancar y luego todos los días a <c>FxRates:SyncHourUtc</c>.
/// <para>
/// La corrida de arranque no es un accidente: si el proceso estuvo caído varios días, es la que recupera
/// el hueco. Es segura porque <see cref="FxRateWritePolicy"/> solo escribe fechas nuevas, así que repetir
/// la corrida no duplica ni sobrescribe.
/// </para>
/// <para>
/// No usa <c>HttpContext</c>: crea un scope por iteración.
/// </para>
/// </summary>
public sealed class FxRateSyncBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly FxRateSyncOptions _options;
    private readonly ILogger<FxRateSyncBackgroundService> _logger;

    public FxRateSyncBackgroundService(
        IServiceScopeFactory scopeFactory,
        IOptions<FxRateSyncOptions> options,
        ILogger<FxRateSyncBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
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
            using var scope = _scopeFactory.CreateScope();
            var syncService = scope.ServiceProvider.GetRequiredService<IFxRateSyncService>();

            var result = await syncService.SyncAsync(stoppingToken);

            // Solo conteos: nunca tasas ni la configuración del proveedor.
            if (result.Failed > 0)
            {
                _logger.LogWarning(
                    "FX rate sync finished with failures: {Synced} synced, {Skipped} skipped, {Failed} failed.",
                    result.Synced,
                    result.Skipped,
                    result.Failed);
            }
            else
            {
                _logger.LogInformation(
                    "FX rate sync finished: {Synced} synced, {Skipped} skipped.",
                    result.Synced,
                    result.Skipped);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado ordenado: no es un error.
        }
        catch (Exception exception)
        {
            // Solo el tipo de excepción: nunca montos, tasas ni payload.
            _logger.LogError("FX rate sync failed: {ErrorType}", exception.GetType().Name);
        }
    }
}
