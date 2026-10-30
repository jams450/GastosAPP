using GastosApp.API.BackgroundServices;
using GastosApp.API.Configuration;
using GastosApp.API.Services.Jobs;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the five schedules the monitoring module must not change (L5).
/// <para>
/// The module adds history and an on-demand path; it does not get to move when a job runs. Two
/// behaviors are easy to break by accident and both are asserted here: the email pass
/// <b>waits</b> before its first run (no startup work, no retries), while the other four run once at
/// startup and then on their interval; and every worker keeps its own enablement and owner guard, so
/// a disabled or ownerless job calls nothing at all.
/// </para>
/// <para>
/// The coordinator is a double: these tests are about the loops, not about the runs. No database, no
/// network, no IMAP, no Telegram.
/// </para>
/// </summary>
public class JobSchedulePreservationTests
{
    private const int OwnerId = 42;

    [Fact]
    public async Task The_email_pass_still_waits_before_its_first_run()
    {
        var coordinator = new FakeJobCoordinator();
        var service = new EmailIngestBackgroundService(
            EmptyScopeFactory(),
            Options.Create(new EmailIngestOptions { Enabled = true, UserId = OwnerId, HourUtc = 12 }),
            TimeProvider.System,
            NullLogger<EmailIngestBackgroundService>.Instance,
            coordinator);

        await service.StartAsync(CancellationToken.None);
        await Task.Delay(150);

        Assert.Empty(coordinator.AutomaticCalls);

        await StopAsync(service);

        Assert.Empty(coordinator.AutomaticCalls);
    }

    [Theory]
    [InlineData(false, OwnerId)]
    [InlineData(true, 0)]
    [InlineData(true, -5)]
    public async Task The_email_pass_stays_inert_when_disabled_or_ownerless(bool enabled, int userId)
    {
        var coordinator = new FakeJobCoordinator();
        var service = new EmailIngestBackgroundService(
            EmptyScopeFactory(),
            Options.Create(new EmailIngestOptions { Enabled = enabled, UserId = userId, HourUtc = 12 }),
            TimeProvider.System,
            NullLogger<EmailIngestBackgroundService>.Instance,
            coordinator);

        await StartAsync(service);

        Assert.Empty(coordinator.AutomaticCalls);
    }

    [Fact]
    public async Task The_fx_job_still_runs_once_at_startup_then_waits_for_its_daily_hour()
    {
        var coordinator = new FakeJobCoordinator();
        var service = new FxRateSyncBackgroundService(
            coordinator,
            Options.Create(new FxRateSyncOptions { Enabled = true, SyncHourUtc = 22 }),
            NullLogger<FxRateSyncBackgroundService>.Instance);

        await StartAsync(service);

        Assert.Equal(new[] { JobKeys.FxRateSync }, coordinator.AutomaticCalls);
    }

    [Fact]
    public async Task The_fx_job_stays_inert_when_disabled()
    {
        var coordinator = new FakeJobCoordinator();
        var service = new FxRateSyncBackgroundService(
            coordinator,
            Options.Create(new FxRateSyncOptions { Enabled = false }),
            NullLogger<FxRateSyncBackgroundService>.Instance);

        await StartAsync(service);

        Assert.Empty(coordinator.AutomaticCalls);
    }

    [Fact]
    public async Task The_recurring_engine_still_runs_at_startup_and_keeps_its_owner_guard()
    {
        var coordinator = new FakeJobCoordinator();

        await StartAsync(new RecurringExecutionBackgroundService(
            coordinator,
            Options.Create(new AlertsOptions { Enabled = true, EvaluationIntervalMinutes = 60 }),
            Options.Create(new TelegramOptions { AppUserId = OwnerId }),
            NullLogger<RecurringExecutionBackgroundService>.Instance));

        Assert.Equal(new[] { JobKeys.RecurringExecution }, coordinator.AutomaticCalls);

        var ownerless = new FakeJobCoordinator();
        await StartAsync(new RecurringExecutionBackgroundService(
            ownerless,
            Options.Create(new AlertsOptions { Enabled = true, EvaluationIntervalMinutes = 60 }),
            Options.Create(new TelegramOptions { AppUserId = 0 }),
            NullLogger<RecurringExecutionBackgroundService>.Instance));

        Assert.Empty(ownerless.AutomaticCalls);
    }

    [Fact]
    public async Task The_alert_evaluator_still_runs_at_startup_and_keeps_its_owner_guard()
    {
        var coordinator = new FakeJobCoordinator();

        await StartAsync(new AlertEvaluationBackgroundService(
            coordinator,
            Options.Create(new AlertsOptions { Enabled = true, EvaluationIntervalMinutes = 60 }),
            Options.Create(new TelegramOptions { AppUserId = OwnerId }),
            NullLogger<AlertEvaluationBackgroundService>.Instance));

        Assert.Equal(new[] { JobKeys.AlertEvaluation }, coordinator.AutomaticCalls);

        var ownerless = new FakeJobCoordinator();
        await StartAsync(new AlertEvaluationBackgroundService(
            ownerless,
            Options.Create(new AlertsOptions { Enabled = true, EvaluationIntervalMinutes = 60 }),
            Options.Create(new TelegramOptions { AppUserId = 0 }),
            NullLogger<AlertEvaluationBackgroundService>.Instance));

        Assert.Empty(ownerless.AutomaticCalls);
    }

    [Fact]
    public async Task The_alert_dispatch_still_runs_at_startup_on_its_own_interval()
    {
        var coordinator = new FakeJobCoordinator();

        await StartAsync(new AlertDispatchBackgroundService(
            coordinator,
            Options.Create(new AlertsOptions { Enabled = true, DispatchSeconds = 30, BatchSize = 20, MaxAttempts = 5 }),
            NullLogger<AlertDispatchBackgroundService>.Instance));

        Assert.Equal(new[] { JobKeys.AlertDispatch }, coordinator.AutomaticCalls);
    }

    [Fact]
    public async Task The_three_alert_workers_stay_inert_when_alerts_are_disabled()
    {
        var coordinator = new FakeJobCoordinator();
        var alerts = Options.Create(new AlertsOptions { Enabled = false });
        var telegram = Options.Create(new TelegramOptions { AppUserId = OwnerId });

        await StartAsync(new RecurringExecutionBackgroundService(
            coordinator, alerts, telegram, NullLogger<RecurringExecutionBackgroundService>.Instance));
        await StartAsync(new AlertEvaluationBackgroundService(
            coordinator, alerts, telegram, NullLogger<AlertEvaluationBackgroundService>.Instance));
        await StartAsync(new AlertDispatchBackgroundService(
            coordinator, alerts, NullLogger<AlertDispatchBackgroundService>.Instance));

        Assert.Empty(coordinator.AutomaticCalls);
    }

    [Fact]
    public async Task A_worker_loop_survives_a_coordinator_that_throws()
    {
        // These are BackgroundServices: an escaping exception stops the whole host on .NET 6+, and a
        // stopped host is a silent outage. The coordinator swallows its own failures; this pins that
        // a defect there still cannot take the API down.
        var coordinator = new FakeJobCoordinator { Failure = new InvalidOperationException("boom") };
        var service = new FxRateSyncBackgroundService(
            coordinator,
            Options.Create(new FxRateSyncOptions { Enabled = true, SyncHourUtc = 22 }),
            NullLogger<FxRateSyncBackgroundService>.Instance);

        await service.StartAsync(CancellationToken.None);
        await Task.Delay(100);

        await StopAsync(service);
    }

    // ---------- Helpers ----------

    private static async Task StartAsync(Microsoft.Extensions.Hosting.IHostedService service)
    {
        await service.StartAsync(CancellationToken.None);
        await Task.Delay(150);
        await StopAsync(service);
    }

    private static async Task StopAsync(Microsoft.Extensions.Hosting.IHostedService service)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await service.StopAsync(timeout.Token);
    }

    private static IServiceScopeFactory EmptyScopeFactory() =>
        new ServiceCollection().BuildServiceProvider().GetRequiredService<IServiceScopeFactory>();
}

/// <summary>Records the automatic runs a worker asked for, and can refuse them on demand.</summary>
internal sealed class FakeJobCoordinator : IJobCoordinator
{
    public List<string> AutomaticCalls { get; } = new();

    public Exception? Failure { get; set; }

    public Task RunAutomaticAsync(string jobKey, CancellationToken cancellationToken)
    {
        AutomaticCalls.Add(jobKey);

        return Failure is null ? Task.CompletedTask : Task.FromException(Failure);
    }

    public Task EnsureReconciledAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task<int> ReconcileAsync(CancellationToken cancellationToken) => Task.FromResult(0);

    public Task<JobBeginResult> TryBeginAsync(string jobKey, string trigger, string? requestedBy, CancellationToken cancellationToken) =>
        throw new NotSupportedException();

    public Task<JobRunOutcome> RunAsync(JobLease lease, CancellationToken cancellationToken) =>
        throw new NotSupportedException();

    public Task AbandonAsync(JobLease lease, string status, CancellationToken cancellationToken) =>
        throw new NotSupportedException();

    public bool IsRunning(string jobKey) => false;

    public int? CurrentRunId(string jobKey) => null;
}
