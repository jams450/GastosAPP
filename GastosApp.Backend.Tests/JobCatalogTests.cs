using GastosApp.API.Configuration;
using GastosApp.API.Services.Jobs;
using Microsoft.Extensions.Options;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the catalog that is the only place a job key can come from (S1/L5).
/// <para>
/// The admin API accepts no arbitrary key, so everything the UI shows — display name, whether the
/// automatic schedule is on, who the configured owner is, and when the next run is — has to be
/// derived here from the <b>same</b> options the workers read. A second, hand-kept table would drift
/// on the first deployment that flips a switch.
/// </para>
/// <para>
/// <c>NextRunAt</c> is deliberately null when it is not knowable: an interval worker starts its
/// countdown when the process starts, so promising a wall-clock time would be a lie.
/// </para>
/// </summary>
public class JobCatalogTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 1, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public void The_catalog_is_exactly_the_five_existing_jobs()
    {
        var catalog = Catalog();

        Assert.Equal(
            new[] { JobKeys.EmailIngest, JobKeys.FxRateSync, JobKeys.RecurringExecution, JobKeys.AlertEvaluation, JobKeys.AlertDispatch },
            catalog.Jobs.Select(job => job.Key).ToArray());

        Assert.All(catalog.Jobs, job =>
        {
            Assert.False(string.IsNullOrWhiteSpace(job.DisplayName));
            Assert.False(string.IsNullOrWhiteSpace(job.Description));
            Assert.False(string.IsNullOrWhiteSpace(job.EnabledBy));
        });
    }

    [Fact]
    public void An_unknown_key_is_not_in_the_catalog()
    {
        var catalog = Catalog();

        Assert.False(catalog.TryGet("anything_else", out _));
        Assert.True(catalog.TryGet(JobKeys.EmailIngest, out var known));
        Assert.Equal(JobKeys.EmailIngest, known.Key);
    }

    [Fact]
    public void Each_job_reads_its_own_enablement_switch()
    {
        var catalog = Catalog(
            alerts: new AlertsOptions { Enabled = false },
            fxRates: new FxRateSyncOptions { Enabled = true },
            email: new EmailIngestOptions { Enabled = false });

        Assert.False(Enabled(catalog, JobKeys.EmailIngest));
        Assert.True(Enabled(catalog, JobKeys.FxRateSync));
        Assert.False(Enabled(catalog, JobKeys.RecurringExecution));
        Assert.False(Enabled(catalog, JobKeys.AlertEvaluation));
        Assert.False(Enabled(catalog, JobKeys.AlertDispatch));

        // FxRates:Enabled is independent of Banxico:Enabled on purpose; the catalog must not invent
        // a second switch for the same job.
        Assert.Equal("FxRates:Enabled", Definition(catalog, JobKeys.FxRateSync).EnabledBy);
        Assert.Equal("Alerts:Enabled", Definition(catalog, JobKeys.AlertDispatch).EnabledBy);
        Assert.Equal("Email:Ingest:Enabled", Definition(catalog, JobKeys.EmailIngest).EnabledBy);
    }

    [Fact]
    public void The_three_alert_workers_share_the_alerts_switch_and_the_telegram_owner()
    {
        var catalog = Catalog(
            alerts: new AlertsOptions { Enabled = true },
            telegram: new TelegramOptions { AppUserId = 42 });

        foreach (var key in new[] { JobKeys.RecurringExecution, JobKeys.AlertEvaluation, JobKeys.AlertDispatch })
        {
            Assert.True(Enabled(catalog, key));
            Assert.Equal("Alerts:Enabled", Definition(catalog, key).EnabledBy);
        }

        Assert.Equal(42, Definition(catalog, JobKeys.RecurringExecution).ConfiguredOwnerUserId);
        Assert.Equal("Telegram:AppUserId", Definition(catalog, JobKeys.RecurringExecution).OwnerConfiguredBy);
        Assert.Equal(42, Definition(catalog, JobKeys.AlertEvaluation).ConfiguredOwnerUserId);

        // Dispatch targets a chat, not a user account: it has no owner to configure.
        Assert.Null(Definition(catalog, JobKeys.AlertDispatch).ConfiguredOwnerUserId);
        Assert.Null(Definition(catalog, JobKeys.AlertDispatch).OwnerConfiguredBy);
    }

    [Fact]
    public void The_email_owner_is_the_configured_user_and_never_a_fallback()
    {
        var configured = Catalog(email: new EmailIngestOptions { UserId = 7 });
        Assert.Equal(7, Definition(configured, JobKeys.EmailIngest).ConfiguredOwnerUserId);
        Assert.Equal("Email:Ingest:UserId", Definition(configured, JobKeys.EmailIngest).OwnerConfiguredBy);

        // 0 and negative mean "nobody configured it": there is no implicit user 1.
        Assert.Null(Definition(Catalog(), JobKeys.EmailIngest).ConfiguredOwnerUserId);
        Assert.Null(Definition(
            Catalog(email: new EmailIngestOptions { UserId = -3 }),
            JobKeys.EmailIngest).ConfiguredOwnerUserId);
        Assert.Null(Definition(
            Catalog(telegram: new TelegramOptions { AppUserId = 0 }),
            JobKeys.AlertEvaluation).ConfiguredOwnerUserId);
    }

    [Fact]
    public void Manual_runs_are_never_gated_by_the_automatic_schedule()
    {
        // S3: disabling the schedule must not disable the on-demand run.
        var catalog = Catalog(
            alerts: new AlertsOptions { Enabled = false },
            fxRates: new FxRateSyncOptions { Enabled = false },
            email: new EmailIngestOptions { Enabled = false });

        Assert.All(catalog.Jobs, job => Assert.True(job.ManualRunAllowed));
    }

    [Fact]
    public void The_daily_jobs_publish_their_next_run_and_the_interval_jobs_do_not()
    {
        var catalog = Catalog(
            alerts: new AlertsOptions { Enabled = true, EvaluationIntervalMinutes = 60, DispatchSeconds = 30 },
            fxRates: new FxRateSyncOptions { Enabled = true, SyncHourUtc = 22 },
            email: new EmailIngestOptions { Enabled = true, HourUtc = 12 });

        // 09:00 UTC: the daily slots of today are still ahead.
        Assert.Equal(new DateTimeOffset(2026, 11, 1, 12, 0, 0, TimeSpan.Zero), catalog.NextRunAt(JobKeys.EmailIngest, Now));
        Assert.Equal(new DateTimeOffset(2026, 11, 1, 22, 0, 0, TimeSpan.Zero), catalog.NextRunAt(JobKeys.FxRateSync, Now));

        // Interval workers start their countdown with the process: no wall-clock promise.
        Assert.Null(catalog.NextRunAt(JobKeys.RecurringExecution, Now));
        Assert.Null(catalog.NextRunAt(JobKeys.AlertEvaluation, Now));
        Assert.Null(catalog.NextRunAt(JobKeys.AlertDispatch, Now));

        // The fire-and-forget loops keep their existing shapes, disclosed instead of guessed.
        Assert.Equal(JobSchedule.Interval, Definition(catalog, JobKeys.AlertEvaluation).Schedule.Kind);
        Assert.Equal(3600, Definition(catalog, JobKeys.AlertEvaluation).Schedule.IntervalSeconds);
        Assert.Equal(30, Definition(catalog, JobKeys.AlertDispatch).Schedule.IntervalSeconds);
        Assert.False(Definition(catalog, JobKeys.EmailIngest).Schedule.RunsAtStartup);
        Assert.True(Definition(catalog, JobKeys.FxRateSync).Schedule.RunsAtStartup);
        Assert.True(Definition(catalog, JobKeys.AlertDispatch).Schedule.RunsAtStartup);
    }

    [Fact]
    public void A_disabled_daily_job_publishes_no_next_run()
    {
        var catalog = Catalog(
            fxRates: new FxRateSyncOptions { Enabled = false, SyncHourUtc = 22 },
            email: new EmailIngestOptions { Enabled = false, HourUtc = 12 });

        Assert.Null(catalog.NextRunAt(JobKeys.EmailIngest, Now));
        Assert.Null(catalog.NextRunAt(JobKeys.FxRateSync, Now));
    }

    [Fact]
    public void The_next_run_of_a_daily_job_is_computed_with_the_job_s_own_schedule_rule()
    {
        var catalog = Catalog(
            fxRates: new FxRateSyncOptions { Enabled = true, SyncHourUtc = 22 },
            email: new EmailIngestOptions { Enabled = true, HourUtc = 12 });

        // Exactly on the hour the run of today already happened: the next one is tomorrow, never
        // "zero seconds from now" (the closed loop the schedule helpers exist to prevent).
        var noon = new DateTimeOffset(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);
        Assert.Equal(
            new DateTimeOffset(2026, 11, 2, 12, 0, 0, TimeSpan.Zero),
            catalog.NextRunAt(JobKeys.EmailIngest, noon));
    }

    // ---------- Helpers ----------

    private static JobDefinition Definition(IJobCatalog catalog, string jobKey)
    {
        Assert.True(catalog.TryGet(jobKey, out var definition));
        return definition;
    }

    private static bool Enabled(IJobCatalog catalog, string jobKey) => Definition(catalog, jobKey).AutomaticEnabled;

    /// <summary>
    /// Catálogo armado con las mismas opciones que lee el worker. Vive aquí, y no en
    /// <see cref="JobTestFactory"/>, porque el catálogo no necesita al coordinador: así sus pruebas
    /// se leen y se ejecutan sin arrastrar el módulo de ejecución.
    /// </summary>
    private static JobCatalog Catalog(
        AlertsOptions? alerts = null,
        TelegramOptions? telegram = null,
        FxRateSyncOptions? fxRates = null,
        EmailIngestOptions? email = null) => new(
            Options.Create(alerts ?? new AlertsOptions()),
            Options.Create(telegram ?? new TelegramOptions()),
            Options.Create(fxRates ?? new FxRateSyncOptions()),
            Options.Create(email ?? new EmailIngestOptions()));
}
