using GastosApp.API.Services.Jobs;
using GastosApp.Models.Entities;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the coordinator that makes one process execute one job at a time, and the history row that
/// every execution leaves behind (S1/S3/L5).
/// <para>
/// The rules that must not be renegotiated: an automatic run and a manual run of the same job never
/// overlap (a double click included), a run whose history row cannot be written never executes its
/// side effects, a throwing runner is recorded with the exception <b>type</b> only, and an
/// interrupted process marks its orphaned rows as <c>interrupted</c> before the next execution.
/// </para>
/// <para>
/// No database, no network: the store, the runner and the execution host are doubles from
/// <c>JobTestFixtures.cs</c> (they are shared with <see cref="JobAdministrationTests"/> and
/// <see cref="JobContainerWiringTests"/>). The real EF mapping is fixed separately in
/// <see cref="JobPersistenceContractTests"/>.
/// </para>
/// </summary>
public class JobMonitoringCoordinatorTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    // ---------- No overlap: automatic vs manual, and the double click ----------

    [Fact]
    public async Task An_automatic_run_of_a_job_that_is_already_running_is_rejected()
    {
        var store = new FakeJobRunStore();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var runner = new FakeJobRunner(JobKeys.EmailIngest, async _ =>
        {
            await gate.Task;
            return JobRunOutcome.Succeeded(3);
        });

        var coordinator = JobTestFactory.Coordinator(store, runner);

        var manual = await coordinator.TryBeginAsync(JobKeys.EmailIngest, JobRunTrigger.Manual, "admin@x", default);
        Assert.Equal(JobBeginStatus.Started, manual.Status);

        var running = coordinator.RunAsync(manual.Lease!, CancellationToken.None);
        await runner.Started.Task;

        var automatic = await coordinator.TryBeginAsync(JobKeys.EmailIngest, JobRunTrigger.Automatic, null, default);

        Assert.Equal(JobBeginStatus.AlreadyRunning, automatic.Status);
        Assert.Null(automatic.Lease);
        Assert.Single(store.Creations);

        gate.SetResult();
        Assert.Equal(JobRunStatus.Succeeded, (await running).Status);
        Assert.Equal(1, runner.Calls);
        Assert.False(coordinator.IsRunning(JobKeys.EmailIngest));
    }

    [Fact]
    public async Task A_double_click_creates_exactly_one_run()
    {
        var store = new FakeJobRunStore();
        var coordinator = JobTestFactory.Coordinator(
            store,
            new FakeJobRunner(JobKeys.FxRateSync, _ => Task.FromResult(JobRunOutcome.Succeeded(1))));

        var first = coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Manual, "admin@x", default);
        var second = coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Manual, "admin@x", default);
        var results = await Task.WhenAll(first, second);

        Assert.Single(results, result => result.Status == JobBeginStatus.Started);
        Assert.Single(results, result => result.Status == JobBeginStatus.AlreadyRunning);
        Assert.Single(store.Creations);
        Assert.Equal(JobKeys.FxRateSync, store.Creations[0].JobKey);
        Assert.Equal(JobRunTrigger.Manual, store.Creations[0].Trigger);
        Assert.Equal("admin@x", store.Creations[0].RequestedBy);
        Assert.Equal(Now, store.Creations[0].StartedAtUtc);
    }

    [Fact]
    public async Task Different_jobs_still_run_at_the_same_time()
    {
        // Single-process coordination is per job: making it global would serialize the five workers
        // and change the schedule the module is supposed to preserve.
        var store = new FakeJobRunStore();
        var coordinator = JobTestFactory.Coordinator(
            store,
            new FakeJobRunner(JobKeys.EmailIngest, _ => Task.FromResult(JobRunOutcome.Succeeded(1))),
            new FakeJobRunner(JobKeys.AlertDispatch, _ => Task.FromResult(JobRunOutcome.Succeeded(1))));

        var email = await coordinator.TryBeginAsync(JobKeys.EmailIngest, JobRunTrigger.Automatic, null, default);
        var dispatch = await coordinator.TryBeginAsync(JobKeys.AlertDispatch, JobRunTrigger.Automatic, null, default);

        Assert.Equal(JobBeginStatus.Started, email.Status);
        Assert.Equal(JobBeginStatus.Started, dispatch.Status);
        Assert.Equal(2, store.Creations.Count);
    }

    [Fact]
    public async Task An_unknown_job_key_never_touches_the_history()
    {
        var store = new FakeJobRunStore();
        var coordinator = JobTestFactory.Coordinator(
            store,
            new FakeJobRunner(JobKeys.EmailIngest, _ => Task.FromResult(JobRunOutcome.Succeeded(1))));

        var result = await coordinator.TryBeginAsync("drop_everything", JobRunTrigger.Manual, "admin@x", default);

        Assert.Equal(JobBeginStatus.UnknownJob, result.Status);
        Assert.Empty(store.Creations);
        Assert.Empty(store.Completions);
    }

    // ---------- History first: no untracked side effects ----------

    [Fact]
    public async Task A_run_whose_history_row_cannot_be_written_does_not_execute()
    {
        var store = new FakeJobRunStore { CreateFailure = new TimeoutException() };
        var runner = new FakeJobRunner(JobKeys.FxRateSync, _ => Task.FromResult(JobRunOutcome.Succeeded(1)));
        var coordinator = JobTestFactory.Coordinator(store, runner);

        var result = await coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Automatic, null, default);

        Assert.Equal(JobBeginStatus.HistoryUnavailable, result.Status);
        Assert.Equal(0, runner.Calls);
        Assert.False(coordinator.IsRunning(JobKeys.FxRateSync));
    }

    [Fact]
    public async Task An_automatic_run_never_propagates_a_runner_exception_to_its_loop()
    {
        // The five workers are BackgroundServices: an escaping exception stops the host in .NET 6+.
        var store = new FakeJobRunStore();
        var runner = new FakeJobRunner(JobKeys.AlertEvaluation, _ => throw new InvalidOperationException("boom"));
        var coordinator = JobTestFactory.Coordinator(store, runner);

        await coordinator.RunAutomaticAsync(JobKeys.AlertEvaluation, CancellationToken.None);

        Assert.Equal(JobRunStatus.Failed, Assert.Single(store.Completions).Status);
    }

    [Fact]
    public async Task The_runner_status_and_counts_are_persisted_as_reported()
    {
        var store = new FakeJobRunStore();
        var coordinator = JobTestFactory.Coordinator(
            store,
            new FakeJobRunner(JobKeys.FxRateSync, _ => Task.FromResult(JobRunOutcome.Partial(4, 2, "sync_failures"))));

        var begun = await coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Automatic, null, default);
        await coordinator.RunAsync(begun.Lease!, CancellationToken.None);

        var completion = Assert.Single(store.Completions);
        Assert.Equal(begun.Lease!.JobRunId, completion.JobRunId);
        Assert.Equal(JobRunStatus.Partial, completion.Status);
        Assert.Equal(4, completion.ItemsProcessed);
        Assert.Equal(2, completion.ItemsFailed);
        Assert.Equal("sync_failures", completion.OutcomeCode);
        Assert.Null(completion.FailureType);
        Assert.Equal(Now, completion.FinishedAtUtc);
    }

    [Fact]
    public async Task A_throwing_runner_is_recorded_with_the_exception_type_and_never_its_message()
    {
        var store = new FakeJobRunStore();
        var coordinator = JobTestFactory.Coordinator(
            store,
            new FakeJobRunner(JobKeys.EmailIngest, _ => throw new InvalidOperationException("secret-payload")));

        var begun = await coordinator.TryBeginAsync(JobKeys.EmailIngest, JobRunTrigger.Automatic, null, default);
        var outcome = await coordinator.RunAsync(begun.Lease!, CancellationToken.None);

        Assert.Equal(JobRunStatus.Failed, outcome.Status);
        var completion = Assert.Single(store.Completions);
        Assert.Equal("InvalidOperationException", completion.FailureType);
        Assert.DoesNotContain("secret-payload", completion.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_runner_that_reports_running_instead_of_finishing_is_recorded_as_failed()
    {
        // The runner cannot know it is still running: accepting that status would leave a row that
        // only a restart could clean up, and hide the bug.
        var store = new FakeJobRunStore();
        var coordinator = JobTestFactory.Coordinator(
            store,
            new FakeJobRunner(JobKeys.EmailIngest, _ => Task.FromResult(
                new JobRunOutcome(JobRunStatus.Running, 0, 0, null, null))));

        var begun = await coordinator.TryBeginAsync(JobKeys.EmailIngest, JobRunTrigger.Automatic, null, default);
        await coordinator.RunAsync(begun.Lease!, CancellationToken.None);

        Assert.Equal(JobRunStatus.Failed, Assert.Single(store.Completions).Status);
    }

    [Fact]
    public async Task A_missing_runner_is_recorded_as_failed_instead_of_leaving_the_row_running()
    {
        var store = new FakeJobRunStore();
        var coordinator = JobTestFactory.Coordinator(store);

        var begun = await coordinator.TryBeginAsync(JobKeys.RecurringExecution, JobRunTrigger.Manual, "admin@x", default);
        await coordinator.RunAsync(begun.Lease!, CancellationToken.None);

        var completion = Assert.Single(store.Completions);
        Assert.Equal(JobRunStatus.Failed, completion.Status);
        Assert.Equal("runner_missing", completion.OutcomeCode);
        Assert.False(coordinator.IsRunning(JobKeys.RecurringExecution));
    }

    // ---------- Shutdown ----------

    [Fact]
    public async Task Shutdown_interrupts_the_run_and_releases_the_job()
    {
        var store = new FakeJobRunStore();
        var runner = new FakeJobRunner(JobKeys.AlertDispatch, async cancellationToken =>
        {
            await Task.Delay(Timeout.Infinite, cancellationToken);
            return JobRunOutcome.Succeeded(0);
        });
        var coordinator = JobTestFactory.Coordinator(store, runner);

        var begun = await coordinator.TryBeginAsync(JobKeys.AlertDispatch, JobRunTrigger.Automatic, null, default);
        using var shutdown = new CancellationTokenSource();

        var running = coordinator.RunAsync(begun.Lease!, shutdown.Token);
        await runner.Started.Task;
        shutdown.Cancel();

        var outcome = await running;

        Assert.Equal(JobRunStatus.Interrupted, outcome.Status);
        Assert.Equal(JobRunStatus.Interrupted, Assert.Single(store.Completions).Status);
        Assert.False(coordinator.IsRunning(JobKeys.AlertDispatch));

        var again = await coordinator.TryBeginAsync(JobKeys.AlertDispatch, JobRunTrigger.Manual, "admin@x", default);
        Assert.Equal(JobBeginStatus.Started, again.Status);
    }

    [Fact]
    public async Task A_completion_write_failure_releases_the_job_and_does_not_throw()
    {
        var store = new FakeJobRunStore { CompleteFailure = new TimeoutException() };
        var coordinator = JobTestFactory.Coordinator(
            store,
            new FakeJobRunner(JobKeys.FxRateSync, _ => Task.FromResult(JobRunOutcome.Succeeded(1))));

        var begun = await coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Automatic, null, default);
        var outcome = await coordinator.RunAsync(begun.Lease!, CancellationToken.None);

        Assert.Equal(JobRunStatus.Succeeded, outcome.Status);
        Assert.False(coordinator.IsRunning(JobKeys.FxRateSync));
    }

    [Fact]
    public async Task An_abandoned_run_is_closed_as_interrupted_and_releases_the_job()
    {
        // Used when the host refuses to start the detached execution during shutdown: the row must
        // not stay "running" for a whole process lifetime.
        var store = new FakeJobRunStore();
        var coordinator = JobTestFactory.Coordinator(
            store,
            new FakeJobRunner(JobKeys.FxRateSync, _ => Task.FromResult(JobRunOutcome.Succeeded(1))));

        var begun = await coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Manual, "admin@x", default);
        await coordinator.AbandonAsync(begun.Lease!, JobRunStatus.Interrupted, CancellationToken.None);

        Assert.Equal(JobRunStatus.Interrupted, Assert.Single(store.Completions).Status);
        Assert.False(coordinator.IsRunning(JobKeys.FxRateSync));
    }

    // ---------- Startup reconciliation ----------

    [Fact]
    public async Task Startup_reconciliation_runs_before_the_first_execution_and_only_once()
    {
        var order = new List<string>();
        var store = new FakeJobRunStore { Order = order, InterruptedRows = 2 };
        var runner = new FakeJobRunner(JobKeys.FxRateSync, _ => Task.FromResult(JobRunOutcome.Succeeded(1)))
        {
            Order = order
        };
        var coordinator = JobTestFactory.Coordinator(store, runner);

        await coordinator.EnsureReconciledAsync(CancellationToken.None);

        var first = await coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Automatic, null, default);
        await coordinator.RunAsync(first.Lease!, CancellationToken.None);

        var second = await coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Automatic, null, default);
        await coordinator.RunAsync(second.Lease!, CancellationToken.None);

        Assert.Equal(1, store.InterruptCalls);
        Assert.Equal(
            new[] { "interrupt", "create:fx_rate_sync", "run:fx_rate_sync", "complete", "create:fx_rate_sync", "run:fx_rate_sync", "complete" },
            order);
    }

    [Fact]
    public async Task The_first_execution_reconciles_even_when_no_startup_step_ran()
    {
        // Hosted services start in registration order, so a worker can reach this coordinator before
        // any startup step: the guarantee lives in the begin, not in the ordering.
        var store = new FakeJobRunStore { InterruptedRows = 1 };
        var runner = new FakeJobRunner(JobKeys.EmailIngest, _ => Task.FromResult(JobRunOutcome.Succeeded(1)));
        var coordinator = JobTestFactory.Coordinator(store, runner);

        var begun = await coordinator.TryBeginAsync(JobKeys.EmailIngest, JobRunTrigger.Automatic, null, default);
        await coordinator.RunAsync(begun.Lease!, CancellationToken.None);

        Assert.Equal(1, store.InterruptCalls);
        Assert.Equal(1, runner.Calls);
    }

    [Fact]
    public async Task A_failed_reconciliation_is_retried_instead_of_being_cached_as_done()
    {
        var store = new FakeJobRunStore { InterruptFailure = new TimeoutException() };
        var coordinator = JobTestFactory.Coordinator(
            store,
            new FakeJobRunner(JobKeys.FxRateSync, _ => Task.FromResult(JobRunOutcome.Succeeded(1))));

        // The reconcile failure is logged, not thrown: a broken history read must not kill the host.
        Assert.Equal(-1, await coordinator.ReconcileAsync(CancellationToken.None));

        // Both attempts retry the reconciliation, because caching a failure as "already done" would
        // leave orphaned running rows forever.
        var first = await coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Automatic, null, default);
        var second = await coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Automatic, null, default);

        Assert.Equal(JobBeginStatus.HistoryUnavailable, first.Status);
        Assert.Equal(JobBeginStatus.HistoryUnavailable, second.Status);
        Assert.Equal(3, store.InterruptCalls);
        Assert.Empty(store.Creations);
    }

    [Fact]
    public async Task A_failed_reconciliation_blocks_every_run_even_when_the_insert_would_work()
    {
        var store = new FakeJobRunStore { InterruptFailure = new TimeoutException() };
        var runner = new FakeJobRunner(JobKeys.FxRateSync, _ => Task.FromResult(JobRunOutcome.Succeeded(1)));
        var coordinator = JobTestFactory.Coordinator(store, runner);

        // El historial se puede escribir, pero no se puede afirmar que no queden corridas huérfanas:
        // ejecutar aquí sería trabajo sin la reconciliación previa que la especificación exige.
        var blocked = await coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Automatic, null, default);

        Assert.Equal(JobBeginStatus.HistoryUnavailable, blocked.Status);
        Assert.Null(blocked.Lease);
        Assert.Empty(store.Creations);
        Assert.Equal(0, runner.Calls);
        Assert.False(coordinator.IsRunning(JobKeys.FxRateSync));
        Assert.Null(coordinator.CurrentRunId(JobKeys.FxRateSync));

        // Y no queda una toma retenida: en cuanto la reconciliación vuelve a funcionar, el mismo job
        // arranca sin reiniciar el proceso.
        store.InterruptFailure = null;

        var begun = await coordinator.TryBeginAsync(JobKeys.FxRateSync, JobRunTrigger.Automatic, null, default);

        Assert.Equal(JobBeginStatus.Started, begun.Status);
        await coordinator.RunAsync(begun.Lease!, CancellationToken.None);

        Assert.Equal(1, runner.Calls);
        Assert.Equal(JobRunStatus.Succeeded, Assert.Single(store.Completions).Status);
    }

    [Fact]
    public async Task The_startup_step_interrupts_before_any_worker_executes()
    {
        var store = new FakeJobRunStore { InterruptedRows = 3 };
        var coordinator = JobTestFactory.Coordinator(store);

        await coordinator.EnsureReconciledAsync(CancellationToken.None);

        Assert.Equal(1, store.InterruptCalls);
        Assert.Equal(3, store.InterruptedRows);
    }
}
