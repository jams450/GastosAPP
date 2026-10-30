using GastosApp.BusinessLogic.Interfaces;

namespace GastosApp.API.Services.Jobs.Runners;

/// <summary>
/// Adaptador de la sincronización de tipos de cambio (S1/L5). Llama al mismo
/// <see cref="IFxRateSyncService"/> que el worker.
/// <para>
/// No lee <c>FxRates:Enabled</c>: con el horario apagado la corrida manual sigue disponible (S3), y
/// la idempotencia de la escritura (solo fechas nuevas) hace que correrla de más no duplique ni
/// sobrescriba una tasa.
/// </para>
/// <para>
/// Una divisa caída no cancela a las demás, pero <b>sí</b> cambia el veredicto: la corrida se cierra
/// como <c>partial</c> y no como <c>succeeded</c>, para que el hueco se investigue.
/// </para>
/// </summary>
public sealed class FxRateSyncJobRunner : IJobRunner
{
    private readonly IFxRateSyncService _syncService;
    private readonly ILogger<FxRateSyncJobRunner> _logger;

    public FxRateSyncJobRunner(IFxRateSyncService syncService, ILogger<FxRateSyncJobRunner> logger)
    {
        _syncService = syncService;
        _logger = logger;
    }

    public string JobKey => JobKeys.FxRateSync;

    public async Task<JobRunOutcome> RunAsync(CancellationToken cancellationToken)
    {
        var result = await _syncService.SyncAsync(cancellationToken);

        // Solo conteos: nunca tasas ni la configuración del proveedor.
        if (result.Failed > 0)
        {
            _logger.LogWarning(
                "FX rate sync finished with failures: {Synced} synced, {Skipped} skipped, {Failed} failed.",
                result.Synced,
                result.Skipped,
                result.Failed);

            return JobRunOutcome.Partial(result.Synced, result.Failed, "sync_failures");
        }

        _logger.LogInformation(
            "FX rate sync finished: {Synced} synced, {Skipped} skipped.",
            result.Synced,
            result.Skipped);

        return JobRunOutcome.Succeeded(result.Synced);
    }
}
