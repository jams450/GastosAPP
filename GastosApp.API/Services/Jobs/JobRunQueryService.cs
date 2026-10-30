using GastosApp.API.Models.Jobs;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.API.Services.Jobs;

/// <summary>Filtros del historial, ya validados y con la paginación acotada.</summary>
public sealed record JobHistoryFilter(
    string? JobKey,
    string? Status,
    string? Trigger,
    int Page,
    int PageSize);

/// <summary>
/// Reglas de paginación del historial. Son funciones puras porque el tope es lo que impide que una
/// pantalla pida la tabla completa: sin retención destructiva, el historial solo crece.
/// </summary>
public static class JobHistoryQuery
{
    public const int DefaultPageSize = 25;

    public const int MaxPageSize = 100;

    public static int NormalizePage(int? page) => page is null or < 1 ? 1 : page.Value;

    public static int NormalizePageSize(int? pageSize) =>
        pageSize is null ? DefaultPageSize : Math.Clamp(pageSize.Value, 1, MaxPageSize);

    public static int TotalPages(int totalCount, int pageSize) =>
        totalCount <= 0 ? 0 : (totalCount + pageSize - 1) / pageSize;
}

/// <summary>Lectura del historial para la pantalla de administración.</summary>
public interface IJobRunQueryService
{
    Task<JobOverviewResponse> GetOverviewAsync(CancellationToken cancellationToken);

    Task<JobHistoryResponse> GetHistoryAsync(JobHistoryFilter filter, CancellationToken cancellationToken);

    Task<JobRunDetailResponse?> GetRunAsync(int jobRunId, CancellationToken cancellationToken);
}

/// <inheritdoc />
public sealed class JobRunQueryService : IJobRunQueryService
{
    private readonly IRepository _repository;
    private readonly IJobCatalog _catalog;
    private readonly TimeProvider _timeProvider;

    public JobRunQueryService(
        IRepository repository,
        IJobCatalog catalog,
        TimeProvider timeProvider)
    {
        _repository = repository;
        _catalog = catalog;
        _timeProvider = timeProvider;
    }

    public async Task<JobOverviewResponse> GetOverviewAsync(CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        var runs = _repository.Get<JobRun>().AsNoTracking();

        // Un solo agregado para los cinco jobs en vez de cinco consultas de conteo.
        var countsByJobAndStatus = await runs
            .GroupBy(run => new { run.JobKey, run.Status })
            .Select(group => new { group.Key.JobKey, group.Key.Status, Count = group.Count() })
            .ToListAsync(cancellationToken);

        // Las corridas en curso son a lo sumo una por job: leerlas juntas evita cinco consultas.
        var currentRuns = await runs
            .Where(run => run.Status == JobRunStatus.Running)
            .ToListAsync(cancellationToken);

        var overview = new JobOverviewResponse { GeneratedAtUtc = now };

        // Los totales cubren todo el historial, incluidas las claves que ya no están en el catálogo:
        // si solo sumaran los cinco jobs actuales, la pantalla diría que hay menos corridas de las
        // que el historial paginado muestra.
        foreach (var row in countsByJobAndStatus)
        {
            overview.Totals.Add(row.Status, row.Count);
        }

        foreach (var definition in _catalog.Jobs)
        {
            var current = currentRuns.FirstOrDefault(run =>
                string.Equals(run.JobKey, definition.Key, StringComparison.Ordinal));

            var last = await runs
                .Where(run => run.JobKey == definition.Key && run.Status != JobRunStatus.Running)
                .OrderByDescending(run => run.StartedAt)
                .ThenByDescending(run => run.JobRunId)
                .FirstOrDefaultAsync(cancellationToken);

            var jobCounts = new JobStatusCountsResponse();

            foreach (var row in countsByJobAndStatus.Where(row =>
                string.Equals(row.JobKey, definition.Key, StringComparison.Ordinal)))
            {
                jobCounts.Add(row.Status, row.Count);
            }

            overview.Jobs.Add(new JobOverviewItemResponse
            {
                JobKey = definition.Key,
                DisplayName = definition.DisplayName,
                Description = definition.Description,
                AutomaticEnabled = definition.AutomaticEnabled,
                AutomaticEnabledBy = definition.EnabledBy,
                ManualRunAllowed = definition.ManualRunAllowed,
                ConfiguredOwnerUserId = definition.ConfiguredOwnerUserId,
                OwnerConfiguredBy = definition.OwnerConfiguredBy,
                Schedule = new JobScheduleResponse
                {
                    Kind = definition.Schedule.Kind,
                    HourUtc = definition.Schedule.HourUtc,
                    IntervalSeconds = definition.Schedule.IntervalSeconds,
                    RunsAtStartup = definition.Schedule.RunsAtStartup
                },
                NextRunAtUtc = _catalog.NextRunAt(definition.Key, now),
                Current = current is null ? null : ToSummary(current),
                Last = last is null ? null : ToSummary(last),
                Counts = jobCounts
            });
        }

        return overview;
    }

    public async Task<JobHistoryResponse> GetHistoryAsync(
        JobHistoryFilter filter,
        CancellationToken cancellationToken)
    {
        var query = _repository.Get<JobRun>().AsNoTracking();

        if (filter.JobKey is not null)
        {
            query = query.Where(run => run.JobKey == filter.JobKey);
        }

        if (filter.Status is not null)
        {
            query = query.Where(run => run.Status == filter.Status);
        }

        if (filter.Trigger is not null)
        {
            query = query.Where(run => run.Trigger == filter.Trigger);
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var rows = await query
            // Del más reciente al más viejo, con el id como desempate: dos corridas del mismo instante
            // no deben intercambiarse entre páginas.
            .OrderByDescending(run => run.StartedAt)
            .ThenByDescending(run => run.JobRunId)
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync(cancellationToken);

        return new JobHistoryResponse
        {
            Items = rows.Select(ToSummary).ToList(),
            Page = filter.Page,
            PageSize = filter.PageSize,
            TotalCount = totalCount,
            TotalPages = JobHistoryQuery.TotalPages(totalCount, filter.PageSize)
        };
    }

    public async Task<JobRunDetailResponse?> GetRunAsync(int jobRunId, CancellationToken cancellationToken)
    {
        var run = await _repository.Get<JobRun>()
            .AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.JobRunId == jobRunId, cancellationToken);

        if (run is null)
        {
            return null;
        }

        var summary = ToSummary(run);

        return new JobRunDetailResponse
        {
            JobRunId = summary.JobRunId,
            JobKey = summary.JobKey,
            Trigger = summary.Trigger,
            Status = summary.Status,
            StartedAtUtc = summary.StartedAtUtc,
            FinishedAtUtc = summary.FinishedAtUtc,
            DurationMs = summary.DurationMs,
            RequestedBy = summary.RequestedBy,
            ItemsProcessed = summary.ItemsProcessed,
            ItemsFailed = summary.ItemsFailed,
            OutcomeCode = summary.OutcomeCode,
            FailureType = summary.FailureType,
            // Una clave que ya no está en el catálogo conserva su historial: se muestra la clave.
            JobDisplayName = _catalog.TryGet(run.JobKey, out var definition) ? definition.DisplayName : run.JobKey
        };
    }

    private static JobRunSummaryResponse ToSummary(JobRun run)
    {
        var finishedAt = run.FinishedAt;
        var durationMs = finishedAt is DateTimeOffset finished
            ? (long)Math.Max(0, (finished - run.StartedAt).TotalMilliseconds)
            : (long?)null;

        return new JobRunSummaryResponse
        {
            JobRunId = run.JobRunId,
            JobKey = run.JobKey,
            Trigger = run.Trigger,
            Status = run.Status,
            StartedAtUtc = run.StartedAt,
            FinishedAtUtc = finishedAt,
            DurationMs = durationMs,
            RequestedBy = run.RequestedBy,
            ItemsProcessed = run.ItemsProcessed,
            ItemsFailed = run.ItemsFailed,
            OutcomeCode = run.OutcomeCode,
            FailureType = run.FailureType
        };
    }
}
