namespace GastosApp.API.Services.Jobs;

/// <summary>
/// Reconciliación de arranque (L5): las corridas que quedaron en <c>running</c> por un proceso
/// anterior pasan a <c>interrupted</c> antes de que nada nuevo se ejecute.
/// <para>
/// Es un paso de arranque además de la garantía que ya vive en <see cref="JobCoordinator"/>: si
/// ningún job llegara a correr —todos apagados— el historial igual debe dejar de mostrar corridas
/// vivas que no existen. Por eso no bloquea el arranque: un historial inaccesible se registra y la
/// API levanta, porque una base caída no debe impedir servir.
/// </para>
/// </summary>
public sealed class JobMonitoringStartupService : IHostedService
{
    private readonly IJobCoordinator _coordinator;
    private readonly ILogger<JobMonitoringStartupService> _logger;

    public JobMonitoringStartupService(
        IJobCoordinator coordinator,
        ILogger<JobMonitoringStartupService> logger)
    {
        _coordinator = coordinator;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _coordinator.EnsureReconciledAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Apagado durante el arranque.
        }
        catch (Exception exception)
        {
            // Nunca bloquea el arranque de la API. Solo el tipo de excepción.
            _logger.LogError(
                "Job monitoring startup reconciliation failed: {ErrorType}",
                exception.GetType().Name);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
