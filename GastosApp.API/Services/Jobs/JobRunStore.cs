using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;

namespace GastosApp.API.Services.Jobs;

/// <summary>
/// Escritura del historial sobre la tabla <c>job_runs</c>. Usa el repositorio genérico y el scope
/// del llamador: el coordinador abre un scope por operación, nunca reutiliza el de una petición.
/// </summary>
public sealed class JobRunStore : IJobRunStore
{
    /// <summary>
    /// La reconciliación usa el reloj de la base. Es el mismo que ordena el historial, así que no
    /// puede quedar "antes" de la última corrida cerrada por un reloj de aplicación desfasado.
    /// </summary>
    private const string InterruptRunningSql = """
        UPDATE job_runs
        SET status = 'interrupted',
            finished_at = NOW(),
            outcome_code = 'startup_reconcile',
            updated_at = NOW()
        WHERE status = 'running'
        """;

    private const int JobKeyMaxLength = 60;
    private const int RequestedByMaxLength = 100;
    private const int OutcomeCodeMaxLength = 60;
    private const int FailureTypeMaxLength = 100;

    private readonly IRepository _repository;
    private readonly ILogger<JobRunStore> _logger;

    public JobRunStore(IRepository repository, ILogger<JobRunStore> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    public async Task<int> CreateRunningAsync(JobRunCreate creation, CancellationToken cancellationToken)
    {
        var run = new JobRun
        {
            JobKey = Truncate(creation.JobKey, JobKeyMaxLength)!,
            Trigger = creation.Trigger,
            Status = JobRunStatus.Running,
            StartedAt = creation.StartedAtUtc,
            RequestedBy = Truncate(creation.RequestedBy, RequestedByMaxLength)
        };

        await _repository.Save(run);

        return run.JobRunId;
    }

    public async Task CompleteAsync(JobRunCompletion completion, CancellationToken cancellationToken)
    {
        var run = await _repository.GetByIdAsync<JobRun>(completion.JobRunId);

        if (run is null)
        {
            // Solo el id: nunca el resultado ni el mensaje de un fallo.
            _logger.LogWarning(
                "Job run {JobRunId} was not found when it had to be closed.",
                completion.JobRunId);
            return;
        }

        run.Status = completion.Status;
        run.FinishedAt = completion.FinishedAtUtc;
        run.ItemsProcessed = completion.ItemsProcessed;
        run.ItemsFailed = completion.ItemsFailed;
        // Los códigos y el tipo de excepción se recortan al ancho de la columna: un identificador
        // largo debe costar un texto recortado, nunca una corrida que no se puede cerrar.
        run.OutcomeCode = Truncate(completion.OutcomeCode, OutcomeCodeMaxLength);
        run.FailureType = Truncate(completion.FailureType, FailureTypeMaxLength);

        await _repository.SaveChangesAsync();
    }

    public Task<int> MarkRunningAsInterruptedAsync(CancellationToken cancellationToken) =>
        _repository.ExecuteSqlRawAsync(InterruptRunningSql);

    private static string? Truncate(string? value, int maxLength) =>
        value is null || value.Length <= maxLength ? value : value[..maxLength];
}
