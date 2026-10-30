using System.Collections.Concurrent;
using GastosApp.Models.Entities;
using Microsoft.Extensions.DependencyInjection;

namespace GastosApp.API.Services.Jobs;

/// <inheritdoc cref="IJobCoordinator" />
public sealed class JobCoordinator : IJobCoordinator
{
    /// <summary>
    /// Un candado por job dentro del proceso. Es un diccionario concurrente: tomarlo y soltarlo son
    /// atómicos, que es lo que hace que dos clics simultáneos no abran dos corridas.
    /// <para>
    /// Es por job y no global a propósito: serializar los cinco workers cambiaría el horario que el
    /// módulo debe preservar.
    /// </para>
    /// </summary>
    private readonly ConcurrentDictionary<string, JobLease> _running = new(StringComparer.Ordinal);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IJobCatalog _catalog;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<JobCoordinator> _logger;

    private readonly object _reconcileGate = new();
    private Task? _reconcileInFlight;
    private int _reconciled;

    public JobCoordinator(
        IServiceScopeFactory scopeFactory,
        IJobCatalog catalog,
        TimeProvider timeProvider,
        ILogger<JobCoordinator> logger)
    {
        _scopeFactory = scopeFactory;
        _catalog = catalog;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public bool IsRunning(string jobKey) => _running.ContainsKey(jobKey);

    public int? CurrentRunId(string jobKey) =>
        // 0 mientras la fila se está insertando: informar "corrida 0" sería inventar un id.
        _running.TryGetValue(jobKey, out var lease) && lease.JobRunId > 0 ? lease.JobRunId : null;

    public Task EnsureReconciledAsync(CancellationToken cancellationToken) =>
        EnsureReconciledCoreAsync(cancellationToken);

    public async Task<int> ReconcileAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var store = scope.ServiceProvider.GetRequiredService<IJobRunStore>();

            var interrupted = await store.MarkRunningAsInterruptedAsync(cancellationToken);

            if (interrupted > 0)
            {
                // Solo el conteo: el historial dice cuáles fueron.
                _logger.LogWarning(
                    "{Count} job run(s) left running by a previous process were marked interrupted.",
                    interrupted);
            }

            return interrupted;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return -1;
        }
        catch (Exception exception)
        {
            // No se propaga: la reconciliación es diagnóstica y un historial roto no debe tumbar el
            // arranque ni matar un worker. Las ejecuciones siguen y fallarán al no poder escribir su
            // fila, que es justo lo que impide un efecto secundario sin rastro.
            _logger.LogError(
                "Startup job reconciliation failed: {ErrorType}",
                exception.GetType().Name);
            return -1;
        }
    }

    public async Task<JobBeginResult> TryBeginAsync(
        string jobKey,
        string trigger,
        string? requestedBy,
        CancellationToken cancellationToken)
    {
        if (!_catalog.TryGet(jobKey, out _))
        {
            return JobBeginResult.UnknownJob;
        }

        // Antes de ejecutar nada: las corridas huérfanas dejan de verse como "en curso". Si la
        // reconciliación falla no se puede afirmar que el historial esté limpio, así que tampoco se
        // ejecuta: abrir la corrida aquí sería trabajo posterior a una reconciliación que no ocurrió.
        if (!await EnsureReconciledCoreAsync(cancellationToken))
        {
            _logger.LogWarning(
                "Job {JobKey} was not started because the startup reconciliation did not complete.",
                jobKey);

            return JobBeginResult.HistoryUnavailable;
        }

        var startedAt = _timeProvider.GetUtcNow();
        var lease = new JobLease(jobKey, startedAt);

        // El candado se toma ANTES de insertar. Al revés, dos clics insertarían dos filas y solo una
        // podría cerrarse.
        if (!_running.TryAdd(jobKey, lease))
        {
            return JobBeginResult.AlreadyRunning;
        }

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var store = scope.ServiceProvider.GetRequiredService<IJobRunStore>();

            lease.JobRunId = await store.CreateRunningAsync(
                new JobRunCreate(jobKey, trigger, requestedBy, startedAt),
                cancellationToken);

            return JobBeginResult.Started(lease);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Apagado durante la apertura: no es un fallo del historial.
            Release(lease);
            throw;
        }
        catch (Exception exception)
        {
            Release(lease);

            // Sin fila no hay rastro, así que no se ejecuta: es la regla que impide trabajo invisible.
            _logger.LogError(
                "Job {JobKey} was not started because its run history could not be written: {ErrorType}",
                jobKey,
                exception.GetType().Name);

            return JobBeginResult.HistoryUnavailable;
        }
    }

    public async Task<JobRunOutcome> RunAsync(JobLease lease, CancellationToken cancellationToken)
    {
        JobRunOutcome outcome;

        try
        {
            cancellationToken.ThrowIfCancellationRequested();

            using var scope = _scopeFactory.CreateScope();
            var runner = scope.ServiceProvider
                .GetServices<IJobRunner>()
                .FirstOrDefault(candidate => string.Equals(candidate.JobKey, lease.JobKey, StringComparison.Ordinal));

            if (runner is null)
            {
                _logger.LogError("No runner is registered for job {JobKey}.", lease.JobKey);
                outcome = JobRunOutcome.Failed("RunnerNotRegistered", "runner_missing");
            }
            else
            {
                outcome = Sanitize(await runner.RunAsync(cancellationToken));
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Apagado ordenado: no es un fallo del job, y queda visible como interrupción.
            outcome = JobRunOutcome.Interrupted("shutdown");
        }
        catch (Exception exception)
        {
            // Solo el tipo: nunca montos, correo, credenciales ni payload.
            _logger.LogError(
                "Job {JobKey} failed: {ErrorType}",
                lease.JobKey,
                exception.GetType().Name);
            outcome = JobRunOutcome.Failed(exception.GetType().Name);
        }

        await CompleteAsync(lease, outcome);

        return outcome;
    }

    public async Task RunAutomaticAsync(string jobKey, CancellationToken cancellationToken)
    {
        try
        {
            var begun = await TryBeginAsync(jobKey, JobRunTrigger.Automatic, requestedBy: null, cancellationToken);

            if (begun.Status == JobBeginStatus.Started)
            {
                await RunAsync(begun.Lease!, cancellationToken);
                return;
            }

            // Rechazar el solapamiento es el comportamiento correcto también aquí: la corrida en
            // curso ya deja su propia fila en el historial.
            _logger.LogInformation(
                "Automatic run of job {JobKey} skipped: {Reason}.",
                jobKey,
                begun.Status);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Apagado: RunAsync ya cerró la corrida como interrumpida.
        }
        catch (Exception exception)
        {
            // Última barrera: un worker es un BackgroundService y una excepción que escape detiene
            // todo el host en .NET 6+, que es una caída silenciosa.
            _logger.LogError(
                "Automatic run of job {JobKey} failed unexpectedly: {ErrorType}",
                jobKey,
                exception.GetType().Name);
        }
    }

    public Task AbandonAsync(JobLease lease, string status, CancellationToken cancellationToken) =>
        CompleteAsync(lease, new JobRunOutcome(status, 0, 0, "not_executed", null));

    /// <summary>
    /// Un runner solo puede cerrar con un estado final. Aceptar <c>running</c> o un valor inventado
    /// dejaría una fila que únicamente un reinicio podría limpiar, y escondería el error.
    /// </summary>
    private static JobRunOutcome Sanitize(JobRunOutcome? outcome)
    {
        if (outcome is null)
        {
            return JobRunOutcome.Failed("RunnerReturnedNoOutcome", "runner_returned_null");
        }

        return JobRunStatus.Finished.Contains(outcome.Status, StringComparer.Ordinal)
            ? outcome
            : JobRunOutcome.Failed("InvalidRunnerStatus", outcome.OutcomeCode);
    }

    private async Task CompleteAsync(JobLease lease, JobRunOutcome outcome)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var store = scope.ServiceProvider.GetRequiredService<IJobRunStore>();

            // Sin token de apagado: cerrar la fila es precisamente lo que hay que hacer al apagarse.
            await store.CompleteAsync(
                new JobRunCompletion(
                    lease.JobRunId,
                    outcome.Status,
                    outcome.ItemsProcessed,
                    outcome.ItemsFailed,
                    outcome.OutcomeCode,
                    outcome.FailureType,
                    _timeProvider.GetUtcNow()),
                CancellationToken.None);
        }
        catch (Exception exception)
        {
            // La fila queda en 'running' y la reconciliación del siguiente arranque la marcará
            // 'interrupted'. Se libera el job igual: dejarlo tomado convertiría un fallo de escritura
            // en un job que no vuelve a correr hasta reiniciar.
            _logger.LogError(
                "Job {JobKey} run {JobRunId} could not be closed; the next startup will mark it interrupted: {ErrorType}",
                lease.JobKey,
                lease.JobRunId,
                exception.GetType().Name);
        }
        finally
        {
            Release(lease);
        }
    }

    private void Release(JobLease lease) => _running.TryRemove(new KeyValuePair<string, JobLease>(lease.JobKey, lease));

    /// <summary>
    /// Garantiza que la reconciliación ocurrió, y dice si ocurrió. Un intento ya terminado no se
    /// reutiliza: si falló, la siguiente apertura reintenta en vez de heredar el fallo para siempre.
    /// Nunca lanza; un historial inaccesible se traduce en <c>false</c>.
    /// </summary>
    private async Task<bool> EnsureReconciledCoreAsync(CancellationToken cancellationToken)
    {
        if (Volatile.Read(ref _reconciled) == 1)
        {
            return true;
        }

        Task reconcile;

        lock (_reconcileGate)
        {
            if (_reconcileInFlight is null || _reconcileInFlight.IsCompleted)
            {
                _reconcileInFlight = ReconcileOnceAsync();
            }

            reconcile = _reconcileInFlight;
        }

        await reconcile;

        // La bandera la fija el intento que ganó, no el llamador: sirve también cuando el intento
        // compartido lo completó otro hilo.
        return Volatile.Read(ref _reconciled) == 1;
    }

    /// <summary>Una sola reconciliación por proceso; un fallo deja la puerta abierta para reintentar.</summary>
    private async Task ReconcileOnceAsync()
    {
        var interrupted = await ReconcileAsync(CancellationToken.None);

        if (interrupted >= 0)
        {
            Volatile.Write(ref _reconciled, 1);
        }

        lock (_reconcileGate)
        {
            _reconcileInFlight = null;
        }
    }
}
