using GastosApp.BusinessLogic.Context;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the persisted shape of a job run (S1/L5): one row per attempt, never deleted, and a status
/// vocabulary that the API and the database agree on.
/// <para>
/// The entity, the EF mapping, <c>SQL/schema.sql</c> and the dated migration describe the same table
/// in four places, and this repository has no EF migrations to derive one from another. These checks
/// fail on the mistake that actually happens: renaming a status in C# and leaving the CHECK behind,
/// or writing the migration and forgetting the bootstrap schema.
/// </para>
/// <para>
/// The retention rule is asserted, not merely documented: nothing here deletes history, so a large
/// table is handled by pagination instead of a purge job.
/// </para>
/// </summary>
public class JobPersistenceContractTests
{
    private const string TableName = "job_runs";

    private static string MigrationPath => RepoLayout.Resolve("SQL", "migrations", "2026-11-01_job_monitoring.sql");

    private static string SchemaSql => File.ReadAllText(RepoLayout.Resolve("SQL", "schema.sql"));

    private static string MigrationSql => File.ReadAllText(MigrationPath);

    // ---------- EF mapping ----------

    [Fact]
    public void The_entity_maps_to_one_table_keyed_by_the_run_id()
    {
        var entity = Model().FindEntityType(typeof(JobRun));

        Assert.NotNull(entity);
        Assert.Equal(TableName, entity.GetTableName());

        var key = entity.FindPrimaryKey();
        Assert.NotNull(key);
        Assert.Equal("job_run_id", Assert.Single(key.Properties).GetColumnName());
    }

    [Fact]
    public void Every_column_of_a_run_is_mapped_and_bounded()
    {
        var entity = Model().FindEntityType(typeof(JobRun))!;

        var columns = entity.GetProperties().Select(property => property.GetColumnName()).ToArray();

        Assert.Contains("job_key", columns);
        Assert.Contains("trigger", columns);
        Assert.Contains("status", columns);
        Assert.Contains("started_at", columns);
        Assert.Contains("finished_at", columns);
        Assert.Contains("requested_by", columns);
        Assert.Contains("items_processed", columns);
        Assert.Contains("items_failed", columns);
        Assert.Contains("outcome_code", columns);
        Assert.Contains("failure_type", columns);

        // The sanitized failure type is deliberately short: it is an exception type name or a stable
        // code, never a message.
        Assert.Equal(100, entity.FindProperty(nameof(JobRun.FailureType))!.GetMaxLength());
        Assert.Equal(60, entity.FindProperty(nameof(JobRun.OutcomeCode))!.GetMaxLength());
        Assert.Equal(60, entity.FindProperty(nameof(JobRun.JobKey))!.GetMaxLength());
        Assert.Equal(100, entity.FindProperty(nameof(JobRun.RequestedBy))!.GetMaxLength());
    }

    [Fact]
    public void The_history_indexes_support_paging_and_the_current_run_lookup()
    {
        var entity = Model().FindEntityType(typeof(JobRun))!;

        var indexedColumns = entity.GetIndexes()
            .Select(index => string.Join(",", index.Properties.Select(property => property.GetColumnName())))
            .ToHashSet(StringComparer.Ordinal);

        Assert.Contains("job_key,started_at,job_run_id", indexedColumns);
        Assert.Contains("started_at,job_run_id", indexedColumns);
    }

    // ---------- SQL ----------

    [Fact]
    public void The_bootstrap_schema_and_the_migration_declare_the_same_table()
    {
        foreach (var sql in new[] { SchemaSql, MigrationSql })
        {
            Assert.Contains($"CREATE TABLE IF NOT EXISTS {TableName} (", sql, StringComparison.Ordinal);
            Assert.Contains("job_run_id SERIAL PRIMARY KEY", sql, StringComparison.Ordinal);
            Assert.Contains("CREATE INDEX IF NOT EXISTS idx_job_runs_job_started_at", sql, StringComparison.Ordinal);
            Assert.Contains("WHERE status = 'running'", sql, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void The_database_status_vocabulary_matches_the_code()
    {
        foreach (var status in JobRunStatus.All)
        {
            Assert.Contains($"'{status}'", MigrationSql, StringComparison.Ordinal);
        }

        Assert.Contains("CHECK (status IN (", MigrationSql, StringComparison.Ordinal);
        Assert.Contains("CHECK (trigger IN (", MigrationSql, StringComparison.Ordinal);

        foreach (var trigger in JobRunTrigger.All)
        {
            Assert.Contains($"'{trigger}'", MigrationSql, StringComparison.Ordinal);
        }

        // Guard against a status added to the C# list without its SQL counterpart: the CHECK text has
        // exactly as many quoted values as the code knows.
        var statusCheck = LineContaining(MigrationSql, "status IN (");
        foreach (var status in JobRunStatus.All)
        {
            Assert.Contains($"'{status}'", statusCheck, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void A_finished_run_always_has_a_finish_time_and_a_running_one_never_does()
    {
        // Without this invariant "interrupted" and "running" could not be told apart by a query, and
        // a row left running by a dead process would be indistinguishable from a live one.
        Assert.Contains("(status = 'running') = (finished_at IS NULL)", MigrationSql, StringComparison.Ordinal);
        Assert.Contains("(status = 'running') = (finished_at IS NULL)", SchemaSql, StringComparison.Ordinal);
    }

    [Fact]
    public void Nothing_in_the_module_deletes_history()
    {
        foreach (var sql in new[] { SchemaSql, MigrationSql })
        {
            Assert.DoesNotContain($"DELETE FROM {TableName}", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("DROP TABLE", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("TRUNCATE", sql, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void The_migration_is_registered_in_the_manifest_and_the_manifest_stays_sorted()
    {
        var manifestPath = RepoLayout.Resolve("SQL", "migrations", "manifest.txt");
        var entries = File.ReadAllLines(manifestPath)
            .Select(line => line.Trim())
            .Where(line => line.Length > 0 && !line.StartsWith('#'))
            .ToArray();

        Assert.Contains("2026-11-01_job_monitoring.sql", entries);
        Assert.Equal(entries.OrderBy(entry => entry, StringComparer.Ordinal).ToArray(), entries);
    }

    // ---------- Helpers ----------

    private static IModel Model()
    {
        var options = new DbContextOptionsBuilder<ContextSqlGastos>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=model-only;Username=none;Password=none;Timeout=1")
            .Options;

        using var context = new ContextSqlGastos(options, new AnonymousCurrentUser());

        return context.Model;
    }

    private static string LineContaining(string text, string marker) =>
        text.Split('\n').FirstOrDefault(line => line.Contains(marker, StringComparison.Ordinal)) ?? string.Empty;
}
