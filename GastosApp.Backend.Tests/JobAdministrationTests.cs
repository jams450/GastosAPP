using System.Reflection;
using GastosApp.API.Configuration;
using GastosApp.API.Controllers;
using GastosApp.API.Models.Jobs;
using GastosApp.API.Services.Jobs;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the admin contract of the jobs module (S1/S2/S3).
/// <para>
/// Three promises are fixed here: only an administrator can reach the controller, a manual run
/// answers <c>202</c> with the id of a row that already exists (execution continues on the hosted
/// lifetime, never on the request's token), and a run whose history row cannot be written is
/// reported instead of executing untracked.
/// </para>
/// <para>
/// The controller is exercised directly, with doubles for persistence, execution and queries; the
/// pipeline-level authorization is fixed separately by <c>AuthorizationDefaultsTests</c> plus the
/// policy assertion below.
/// </para>
/// </summary>
public class JobAdministrationTests
{
    // ---------- Manual runs ----------

    [Fact]
    public async Task A_manual_run_answers_202_with_the_run_id_before_the_job_finishes()
    {
        var harness = new AdminHarness();
        var requestToken = new CancellationTokenSource();

        var result = await harness.Controller.Run(
            JobKeys.EmailIngest,
            new RunJobRequest { Confirm = true },
            requestToken.Token);

        var accepted = Assert.IsType<AcceptedResult>(result);
        Assert.Equal(202, accepted.StatusCode);
        Assert.Equal("/api/jobs/1", accepted.Location);

        var body = Assert.IsType<ManualRunResponse>(accepted.Value);
        Assert.Equal(1, body.JobRunId);
        Assert.Equal(JobKeys.EmailIngest, body.JobKey);
        Assert.Equal(JobRunTrigger.Manual, body.Trigger);
        Assert.Equal(JobRunStatus.Running, body.Status);

        // The row exists and the job has not executed: the request does not wait for it.
        Assert.Single(harness.Store.Creations);
        Assert.Equal("admin@example.invalid", harness.Store.Creations[0].RequestedBy);
        Assert.Equal(0, harness.Runner.Calls);

        // The client goes away before the job even starts; the run must still complete, because it
        // is bound to the application lifetime and not to the request.
        requestToken.Cancel();
        await harness.Host.InvokeAsync();

        Assert.Equal(1, harness.Runner.Calls);
        Assert.Equal(JobRunStatus.Succeeded, Assert.Single(harness.Store.Completions).Status);
    }

    [Fact]
    public async Task A_second_click_while_the_run_is_in_flight_is_rejected_with_409()
    {
        var harness = new AdminHarness();

        var first = await harness.Controller.Run(JobKeys.FxRateSync, new RunJobRequest { Confirm = true }, default);
        var second = await harness.Controller.Run(JobKeys.FxRateSync, new RunJobRequest { Confirm = true }, default);

        Assert.IsType<AcceptedResult>(first);

        var conflict = Assert.IsType<ConflictObjectResult>(second);
        Assert.Equal(409, conflict.StatusCode);
        var payload = Assert.IsType<JobConflictResponse>(conflict.Value);
        Assert.Equal("already_running", payload.Code);
        Assert.Equal(1, payload.CurrentRunId);

        // Exactly one run, and the job did not start twice.
        Assert.Single(harness.Store.Creations);
        Assert.Equal(0, harness.Runner.Calls);
    }

    [Fact]
    public async Task A_run_without_explicit_confirmation_never_starts()
    {
        var harness = new AdminHarness();

        var refused = await harness.Controller.Run(JobKeys.EmailIngest, new RunJobRequest { Confirm = false }, default);
        var missing = await harness.Controller.Run(JobKeys.EmailIngest, null, default);

        var refusedBody = Assert.IsType<JobErrorResponse>(Assert.IsType<BadRequestObjectResult>(refused).Value);
        Assert.Equal("confirmation_required", refusedBody.Code);
        Assert.Equal(400, Assert.IsType<BadRequestObjectResult>(refused).StatusCode);

        Assert.Equal(
            "confirmation_required",
            Assert.IsType<JobErrorResponse>(Assert.IsType<BadRequestObjectResult>(missing).Value).Code);

        Assert.Empty(harness.Store.Creations);
        Assert.False(harness.Host.HasWork);
    }

    [Fact]
    public async Task An_unknown_job_key_is_rejected_without_touching_the_history()
    {
        var harness = new AdminHarness();

        var result = await harness.Controller.Run("drop_everything", new RunJobRequest { Confirm = true }, default);

        var body = Assert.IsType<JobErrorResponse>(Assert.IsType<BadRequestObjectResult>(result).Value);
        Assert.Equal("unknown_job", body.Code);
        Assert.Empty(harness.Store.Creations);
        Assert.False(harness.Host.HasWork);
    }

    [Fact]
    public async Task Manual_runs_work_while_every_automatic_schedule_is_disabled()
    {
        // S3: the switch that turns the daily pass off is not a switch that forbids the on-demand run.
        var harness = new AdminHarness(
            alerts: new AlertsOptions { Enabled = false },
            fxRates: new FxRateSyncOptions { Enabled = false },
            email: new EmailIngestOptions { Enabled = false });

        var result = await harness.Controller.Run(JobKeys.FxRateSync, new RunJobRequest { Confirm = true }, default);

        Assert.IsType<AcceptedResult>(result);

        await harness.Host.InvokeAsync();

        // El runner de ese job corrió; el del pase de correo no se tocó.
        Assert.Equal(1, harness.FxRunner.Calls);
        Assert.Equal(0, harness.Runner.Calls);
        Assert.Equal(JobRunStatus.Partial, Assert.Single(harness.Store.Completions).Status);
    }

    [Fact]
    public async Task A_run_whose_history_cannot_be_written_is_reported_and_not_executed()
    {
        var harness = new AdminHarness();
        harness.Store.CreateFailure = new TimeoutException();

        var result = await harness.Controller.Run(JobKeys.EmailIngest, new RunJobRequest { Confirm = true }, default);

        var response = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, response.StatusCode);
        Assert.Equal("history_unavailable", Assert.IsType<JobErrorResponse>(response.Value).Code);

        Assert.False(harness.Host.HasWork);
        Assert.Equal(0, harness.Runner.Calls);
    }

    [Fact]
    public async Task A_run_refused_by_a_stopping_host_is_closed_as_interrupted()
    {
        var harness = new AdminHarness();
        harness.Host.Accepts = false;

        var result = await harness.Controller.Run(JobKeys.EmailIngest, new RunJobRequest { Confirm = true }, default);

        var response = Assert.IsType<ObjectResult>(result);
        Assert.Equal(503, response.StatusCode);
        Assert.Equal("shutting_down", Assert.IsType<JobErrorResponse>(response.Value).Code);

        // Leaving the row "running" would make it invisible until the next restart.
        Assert.Equal(JobRunStatus.Interrupted, Assert.Single(harness.Store.Completions).Status);
        Assert.False(harness.Coordinator.IsRunning(JobKeys.EmailIngest));
    }

    // ---------- Catalog, history and detail ----------

    [Fact]
    public async Task The_catalog_endpoint_returns_the_overview()
    {
        var harness = new AdminHarness();

        var result = await harness.Controller.GetJobs(default);

        var overview = Assert.IsType<JobOverviewResponse>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.Same(harness.Query.Overview, overview);
        Assert.Equal(1, harness.Query.OverviewCalls);
    }

    [Theory]
    [InlineData("drop_everything", null, null)]
    [InlineData(null, "exploded", null)]
    [InlineData(null, null, "cron")]
    public async Task History_rejects_a_filter_outside_the_known_vocabulary(string? jobKey, string? status, string? trigger)
    {
        var harness = new AdminHarness();

        var result = await harness.Controller.GetHistory(jobKey, status, trigger, 1, 25, default);

        var body = Assert.IsType<JobErrorResponse>(Assert.IsType<BadRequestObjectResult>(result).Value);
        Assert.Equal("invalid_filter", body.Code);
        Assert.Equal(0, harness.Query.HistoryCalls);
    }

    [Fact]
    public async Task History_passes_bounded_paging_and_the_known_filters()
    {
        var harness = new AdminHarness();

        var result = await harness.Controller.GetHistory(JobKeys.AlertDispatch, JobRunStatus.Partial, JobRunTrigger.Manual, -1, 10_000, default);

        Assert.IsType<OkObjectResult>(result);
        var filter = Assert.Single(harness.Query.Filters);
        Assert.Equal(JobKeys.AlertDispatch, filter.JobKey);
        Assert.Equal(JobRunStatus.Partial, filter.Status);
        Assert.Equal(JobRunTrigger.Manual, filter.Trigger);
        Assert.Equal(1, filter.Page);
        Assert.Equal(JobHistoryQuery.MaxPageSize, filter.PageSize);
    }

    [Fact]
    public async Task A_missing_run_is_reported_as_not_found()
    {
        var harness = new AdminHarness();

        var result = await harness.Controller.GetRun(999, default);

        var notFound = Assert.IsType<NotFoundObjectResult>(result);
        Assert.Equal("not_found", Assert.IsType<JobErrorResponse>(notFound.Value).Code);
    }

    [Fact]
    public async Task An_existing_run_is_returned_with_its_job_name()
    {
        var harness = new AdminHarness();
        harness.Query.Detail = new JobRunDetailResponse
        {
            JobRunId = 7,
            JobKey = JobKeys.FxRateSync,
            Status = JobRunStatus.Failed,
            FailureType = "HttpRequestException",
            JobDisplayName = "Sincronización de tipos de cambio"
        };

        var result = await harness.Controller.GetRun(7, default);

        var detail = Assert.IsType<JobRunDetailResponse>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.Equal(7, detail.JobRunId);
        Assert.Equal("HttpRequestException", detail.FailureType);
        Assert.Equal("Sincronización de tipos de cambio", detail.JobDisplayName);
    }

    [Fact]
    public void The_controller_is_administrator_only()
    {
        // S2: the whole module is administrator-only, and the policy is the one that also requires a
        // valid user id, not merely "authenticated".
        var attribute = typeof(JobsController).GetCustomAttribute<AuthorizeAttribute>();

        Assert.NotNull(attribute);
        Assert.Equal("AdminWithId", attribute.Policy);
    }
}

/// <summary>The controller wired to doubles, exactly as the container wires it.</summary>
internal sealed class AdminHarness
{
    public AdminHarness(
        AlertsOptions? alerts = null,
        FxRateSyncOptions? fxRates = null,
        EmailIngestOptions? email = null,
        TelegramOptions? telegram = null)
    {
        Store = new FakeJobRunStore();
        Runner = new FakeJobRunner(JobKeys.EmailIngest, _ => Task.FromResult(JobRunOutcome.Succeeded(2)));
        FxRunner = new FakeJobRunner(JobKeys.FxRateSync, _ => Task.FromResult(JobRunOutcome.Partial(3, 1, "sync_failures")));
        Coordinator = JobTestFactory.Coordinator(Store, Runner, FxRunner);
        Catalog = JobTestFactory.Catalog(alerts, telegram, fxRates, email);

        Controller = new JobsController(
            Catalog,
            Coordinator,
            Host,
            Query,
            new FakeCurrentUser(),
            NullLogger<JobsController>.Instance);
    }

    public FakeJobRunStore Store { get; }

    public FakeJobRunner Runner { get; }

    public FakeJobRunner FxRunner { get; }

    public JobCoordinator Coordinator { get; }

    public JobCatalog Catalog { get; }

    public FakeJobExecutionHost Host { get; } = new();

    public FakeJobRunQueryService Query { get; } = new();

    public JobsController Controller { get; }
}

/// <summary>Captures the detached execution instead of running it, so "asynchronous" is observable.</summary>
internal sealed class FakeJobExecutionHost : IJobExecutionHost
{
    private Func<CancellationToken, Task>? _work;

    public bool Accepts { get; set; } = true;

    public bool HasWork => _work is not null;

    public bool Start(Func<CancellationToken, Task> work)
    {
        if (!Accepts)
        {
            return false;
        }

        _work = work;
        return true;
    }

    public async Task InvokeAsync()
    {
        var work = _work ?? throw new InvalidOperationException("No detached execution was scheduled.");
        _work = null;
        await work(CancellationToken.None);
    }
}

internal sealed class FakeJobRunQueryService : IJobRunQueryService
{
    public JobOverviewResponse Overview { get; set; } = new()
    {
        GeneratedAtUtc = new DateTimeOffset(2026, 11, 1, 12, 0, 0, TimeSpan.Zero),
        Jobs = new List<JobOverviewItemResponse>()
    };

    public JobRunDetailResponse? Detail { get; set; }

    public int OverviewCalls { get; private set; }

    public int HistoryCalls { get; private set; }

    public List<JobHistoryFilter> Filters { get; } = new();

    public Task<JobOverviewResponse> GetOverviewAsync(CancellationToken cancellationToken)
    {
        OverviewCalls++;
        return Task.FromResult(Overview);
    }

    public Task<JobHistoryResponse> GetHistoryAsync(JobHistoryFilter filter, CancellationToken cancellationToken)
    {
        HistoryCalls++;
        Filters.Add(filter);
        return Task.FromResult(new JobHistoryResponse
        {
            Items = new List<JobRunSummaryResponse>(),
            Page = filter.Page,
            PageSize = filter.PageSize,
            TotalCount = 0,
            TotalPages = 0
        });
    }

    public Task<JobRunDetailResponse?> GetRunAsync(int jobRunId, CancellationToken cancellationToken) =>
        Task.FromResult(Detail);
}

/// <summary>Only the calls the controller needs; everything else is unsupported on purpose.</summary>
internal sealed class FakeCurrentUser : ICurrentUserService
{
    public int? GetUserId() => 1;

    public int GetRequiredUserId() => 1;

    public int? GetSessionVersion() => 1;

    public Guid? GetSessionId() => null;

    public string GetName() => "admin";

    public string GetEmail() => "admin@example.invalid";

    public bool IsAdmin() => true;
}
