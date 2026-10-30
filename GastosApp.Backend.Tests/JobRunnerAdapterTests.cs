using GastosApp.API.Configuration;
using GastosApp.API.Services.Email;
using GastosApp.API.Services.Jobs;
using GastosApp.API.Services.Jobs.Runners;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Alerts;
using GastosApp.BusinessLogic.Models.Fx;
using GastosApp.Models.Entities;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins what each adapter does to the run it reports (S1/S3).
/// <para>
/// The adapters exist so the on-demand path reuses the exact business service of the automatic path.
/// The failure that must stay impossible: an adapter that invents its own owner (the user 1, or a
/// Telegram identity) instead of reading the configured one.
/// </para>
/// <para>
/// The container that makes the five keys runnable is a separate promise, fixed in
/// <see cref="JobContainerWiringTests"/>.
/// </para>
/// </summary>
public class JobRunnerAdapterTests
{
    private const int ConfiguredOwner = 42;

    [Fact]
    public async Task The_email_adapter_uses_only_the_configured_owner()
    {
        var runner = new SpyEmailIngestRunner();
        var adapter = new EmailIngestJobRunner(
            runner,
            Options.Create(new EmailIngestOptions { Enabled = false, UserId = ConfiguredOwner }),
            NullLogger<EmailIngestJobRunner>.Instance);

        var outcome = await adapter.RunAsync(CancellationToken.None);

        // El interruptor del horario está apagado y aun así corre: la corrida manual no depende de él.
        Assert.Equal(ConfiguredOwner, Assert.Single(runner.UserIds));
        Assert.Equal(JobRunStatus.Succeeded, outcome.Status);
        Assert.Equal(2, outcome.ItemsProcessed);
    }

    [Fact]
    public async Task A_pass_that_did_not_run_is_recorded_as_skipped_with_its_code()
    {
        var runner = new SpyEmailIngestRunner
        {
            Result = EmailIngestRunResult.Skip(EmailIngestSkipCode.NotConfigured)
        };
        var adapter = new EmailIngestJobRunner(
            runner,
            Options.Create(new EmailIngestOptions { UserId = ConfiguredOwner }),
            NullLogger<EmailIngestJobRunner>.Instance);

        var outcome = await adapter.RunAsync(CancellationToken.None);

        Assert.Equal(JobRunStatus.Skipped, outcome.Status);
        Assert.Equal(EmailIngestSkipCode.NotConfigured, outcome.OutcomeCode);
        Assert.Null(outcome.FailureType);
    }

    [Fact]
    public async Task A_pass_with_failed_rows_is_partial_and_not_a_success()
    {
        var runner = new SpyEmailIngestRunner
        {
            Result = new EmailIngestRunResult(true, null, Scanned: 5, Planned: 3, Applied: 2, Skipped: 0, Failed: 1)
        };
        var adapter = new EmailIngestJobRunner(
            runner,
            Options.Create(new EmailIngestOptions { UserId = ConfiguredOwner }),
            NullLogger<EmailIngestJobRunner>.Instance);

        var outcome = await adapter.RunAsync(CancellationToken.None);

        Assert.Equal(JobRunStatus.Partial, outcome.Status);
        Assert.Equal(2, outcome.ItemsProcessed);
        Assert.Equal(1, outcome.ItemsFailed);
    }

    [Fact]
    public async Task A_currency_that_failed_turns_the_sync_into_a_partial_run()
    {
        var adapter = new FxRateSyncJobRunner(
            new SpyFxRateSyncService(new FxRateSyncResult(Synced: 4, Skipped: 1, Failed: 2)),
            NullLogger<FxRateSyncJobRunner>.Instance);

        var outcome = await adapter.RunAsync(CancellationToken.None);

        Assert.Equal(JobRunStatus.Partial, outcome.Status);
        Assert.Equal(4, outcome.ItemsProcessed);
        Assert.Equal(2, outcome.ItemsFailed);
        Assert.Equal("sync_failures", outcome.OutcomeCode);
    }

    [Fact]
    public async Task A_clean_sync_reports_the_currencies_it_wrote()
    {
        var adapter = new FxRateSyncJobRunner(
            new SpyFxRateSyncService(new FxRateSyncResult(Synced: 4, Skipped: 1, Failed: 0)),
            NullLogger<FxRateSyncJobRunner>.Instance);

        var outcome = await adapter.RunAsync(CancellationToken.None);

        Assert.Equal(JobRunStatus.Succeeded, outcome.Status);
        Assert.Equal(4, outcome.ItemsProcessed);
        Assert.Equal(0, outcome.ItemsFailed);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task An_alert_evaluation_without_a_configured_owner_does_nothing(int appUserId)
    {
        var service = new SpyAlertEvaluationService();
        var adapter = new AlertEvaluationJobRunner(
            service,
            Options.Create(new TelegramOptions { AppUserId = appUserId }),
            NullLogger<AlertEvaluationJobRunner>.Instance);

        var outcome = await adapter.RunAsync(CancellationToken.None);

        Assert.Equal(JobRunStatus.Skipped, outcome.Status);
        Assert.Equal("owner_missing", outcome.OutcomeCode);
        Assert.Empty(service.UserIds);
    }

    [Fact]
    public async Task An_alert_evaluation_reports_the_budgets_it_reviewed()
    {
        var service = new SpyAlertEvaluationService
        {
            Result = new AlertEvaluationResult { PeriodKey = "2026-11", BudgetsEvaluated = 3, AlertsCreated = 1 }
        };
        var adapter = new AlertEvaluationJobRunner(
            service,
            Options.Create(new TelegramOptions { AppUserId = ConfiguredOwner }),
            NullLogger<AlertEvaluationJobRunner>.Instance);

        var outcome = await adapter.RunAsync(CancellationToken.None);

        Assert.Equal(JobRunStatus.Succeeded, outcome.Status);
        Assert.Equal(3, outcome.ItemsProcessed);
        Assert.Equal(ConfiguredOwner, Assert.Single(service.UserIds));
    }

    private sealed class SpyEmailIngestRunner : IEmailIngestRunner
    {
        public List<int> UserIds { get; } = new();

        public EmailIngestRunResult Result { get; set; } = new(true, null, 1, 2, 2, 0, 0);

        public Task<EmailIngestRunResult> RunAsync(int userId, CancellationToken cancellationToken)
        {
            UserIds.Add(userId);
            return Task.FromResult(Result);
        }
    }

    private sealed class SpyFxRateSyncService : IFxRateSyncService
    {
        private readonly FxRateSyncResult _result;

        public SpyFxRateSyncService(FxRateSyncResult result) => _result = result;

        public Task<FxRateSyncResult> SyncAsync(CancellationToken cancellationToken) => Task.FromResult(_result);
    }

    private sealed class SpyAlertEvaluationService : IAlertEvaluationService
    {
        public List<int> UserIds { get; } = new();

        public AlertEvaluationResult Result { get; set; } = new() { PeriodKey = "2026-11" };

        public Task<AlertEvaluationResult> EvaluateAsync(int appUserId, CancellationToken cancellationToken = default)
        {
            UserIds.Add(appUserId);
            return Task.FromResult(Result);
        }

        public Task<IReadOnlyList<AlertDeliveryListItem>> ListDeliveriesAsync(
            int appUserId,
            string? periodKey = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<AlertDeliveryListItem>>(Array.Empty<AlertDeliveryListItem>());

        public Task<IReadOnlyList<AlertOutboxListItem>> ListOutboxAsync(
            int appUserId,
            string? status = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<AlertOutboxListItem>>(Array.Empty<AlertOutboxListItem>());

        public Task<AlertRetryResult> RetryFailedAsync(
            int appUserId,
            int outboxId,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }
}
