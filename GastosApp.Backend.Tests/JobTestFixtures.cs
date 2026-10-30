using GastosApp.API.Configuration;
using GastosApp.API.Services.Jobs;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Shared doubles for the jobs module tests: the run store, the job runner, the clock and the
/// factory that builds the coordinator and the catalog.
/// <para>
/// They live in their own file because three test classes need them
/// (<c>JobMonitoringCoordinatorTests</c>, <c>JobAdministrationTests</c> and
/// <c>JobContainerWiringTests</c>), and because <see cref="JobTestFactory"/> needs both the
/// coordinator and the catalog: a coordinator unit that shipped them inline could not share them
/// without also dragging the catalog, and the reverse. Keeping them apart is what lets each
/// behavior ship with the tests that pin it.
/// </para>
/// </summary>
internal sealed record RecordedCreation(
    string JobKey,
    string Trigger,
    string? RequestedBy,
    DateTimeOffset StartedAtUtc);

/// <summary>One closed row, as the coordinator asked for it.</summary>
internal sealed record RecordedCompletion(
    int JobRunId,
    string Status,
    int ItemsProcessed,
    int ItemsFailed,
    string? OutcomeCode,
    string? FailureType,
    DateTimeOffset FinishedAtUtc);

/// <summary>
/// Double of the persistence layer. It records what it was asked to write, and each failure mode is
/// switchable so the coordinator's choices around a broken history stay observable.
/// </summary>
internal sealed class FakeJobRunStore : IJobRunStore
{
    private int _nextId = 1;

    public List<RecordedCreation> Creations { get; } = new();

    public List<RecordedCompletion> Completions { get; } = new();

    public List<string>? Order { get; set; }

    public Exception? CreateFailure { get; set; }

    public Exception? CompleteFailure { get; set; }

    public Exception? InterruptFailure { get; set; }

    public int InterruptedRows { get; set; }

    public int InterruptCalls { get; private set; }

    public Task<int> CreateRunningAsync(JobRunCreate creation, CancellationToken cancellationToken)
    {
        if (CreateFailure is not null)
        {
            throw CreateFailure;
        }

        Creations.Add(new RecordedCreation(creation.JobKey, creation.Trigger, creation.RequestedBy, creation.StartedAtUtc));
        Order?.Add($"create:{creation.JobKey}");
        return Task.FromResult(_nextId++);
    }

    public Task CompleteAsync(JobRunCompletion completion, CancellationToken cancellationToken)
    {
        if (CompleteFailure is not null)
        {
            throw CompleteFailure;
        }

        Completions.Add(new RecordedCompletion(
            completion.JobRunId,
            completion.Status,
            completion.ItemsProcessed,
            completion.ItemsFailed,
            completion.OutcomeCode,
            completion.FailureType,
            completion.FinishedAtUtc));
        Order?.Add("complete");
        return Task.CompletedTask;
    }

    public Task<int> MarkRunningAsInterruptedAsync(CancellationToken cancellationToken)
    {
        InterruptCalls++;
        Order?.Add("interrupt");

        if (InterruptFailure is not null)
        {
            throw InterruptFailure;
        }

        return Task.FromResult(InterruptedRows);
    }
}

/// <summary>Double of one job's business pass.</summary>
internal sealed class FakeJobRunner : IJobRunner
{
    private readonly Func<CancellationToken, Task<JobRunOutcome>> _body;

    public FakeJobRunner(string jobKey, Func<CancellationToken, Task<JobRunOutcome>> body)
    {
        JobKey = jobKey;
        _body = body;
    }

    public string JobKey { get; }

    public int Calls { get; private set; }

    public CancellationToken LastToken { get; private set; }

    public List<string>? Order { get; set; }

    public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public async Task<JobRunOutcome> RunAsync(CancellationToken cancellationToken)
    {
        Calls++;
        LastToken = cancellationToken;
        Order?.Add($"run:{JobKey}");
        Started.TrySetResult();
        return await _body(cancellationToken);
    }
}

/// <summary>Fixed clock so the recorded timestamps are assertable.</summary>
internal sealed class FixedTimeProvider : TimeProvider
{
    public FixedTimeProvider(DateTimeOffset now) => Now = now;

    public DateTimeOffset Now { get; set; }

    public override DateTimeOffset GetUtcNow() => Now;
}

internal static class JobTestFactory
{
    public static readonly DateTimeOffset DefaultNow = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    public static JobCoordinator Coordinator(FakeJobRunStore store, params IJobRunner[] runners) =>
        Coordinator(store, DefaultNow, runners);

    public static JobCoordinator Coordinator(FakeJobRunStore store, DateTimeOffset now, params IJobRunner[] runners)
    {
        var services = new ServiceCollection();
        services.AddScoped<IJobRunStore>(_ => store);

        foreach (var runner in runners)
        {
            services.AddScoped<IJobRunner>(_ => runner);
        }

        var provider = services.BuildServiceProvider();

        return new JobCoordinator(
            provider.GetRequiredService<IServiceScopeFactory>(),
            Catalog(),
            new FixedTimeProvider(now),
            NullLogger<JobCoordinator>.Instance);
    }

    public static JobCatalog Catalog(
        AlertsOptions? alerts = null,
        TelegramOptions? telegram = null,
        FxRateSyncOptions? fxRates = null,
        EmailIngestOptions? email = null) => new(
            Options.Create(alerts ?? new AlertsOptions()),
            Options.Create(telegram ?? new TelegramOptions()),
            Options.Create(fxRates ?? new FxRateSyncOptions()),
            Options.Create(email ?? new EmailIngestOptions()));
}
