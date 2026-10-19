using System.Text.RegularExpressions;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the migration ledger introduced for S6: the repository had no way to tell which of the
/// dated files under <c>SQL/migrations/</c> a deployed database has already applied.
/// <para>
/// These checks are static on purpose. They hold without a database, so they run on every build,
/// and they fail on the mistake that actually happens: adding a migration file and forgetting to
/// register it, or letting the manifest drift from what is on disk.
/// </para>
/// </summary>
public class MigrationLedgerTests
{
    private static readonly Regex NamingConvention = new(
        @"^\d{4}-\d{2}-\d{2}_[a-z0-9][a-z0-9_]*\.sql$",
        RegexOptions.CultureInvariant);

    private static string MigrationsDirectory => RepoLayout.Resolve("SQL", "migrations");

    private static string ManifestPath => Path.Combine(MigrationsDirectory, "manifest.txt");

    private static string[] ManifestEntries() =>
        File.ReadAllLines(ManifestPath)
            .Select(line => line.Trim())
            .Where(line => line.Length > 0 && !line.StartsWith('#'))
            .ToArray();

    private static string[] MigrationFilesOnDisk() =>
        Directory.GetFiles(MigrationsDirectory, "*.sql", SearchOption.TopDirectoryOnly)
            .Select(Path.GetFileName)
            .Select(name => name!)
            .ToArray();

    [Fact]
    public void Manifest_lists_exactly_the_migration_files_on_disk()
    {
        var expected = MigrationFilesOnDisk().OrderBy(name => name, StringComparer.Ordinal).ToArray();
        var declared = ManifestEntries().OrderBy(name => name, StringComparer.Ordinal).ToArray();

        var missing = expected.Except(declared, StringComparer.Ordinal).ToArray();
        var stale = declared.Except(expected, StringComparer.Ordinal).ToArray();

        Assert.True(
            missing.Length == 0,
            $"SQL/migrations contains files missing from manifest.txt: {string.Join(", ", missing)}.");
        Assert.True(
            stale.Length == 0,
            $"manifest.txt lists files that do not exist in SQL/migrations: {string.Join(", ", stale)}.");
    }

    [Fact]
    public void Manifest_has_no_duplicate_entries()
    {
        var duplicates = ManifestEntries()
            .GroupBy(name => name, StringComparer.Ordinal)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToArray();

        Assert.True(duplicates.Length == 0, $"manifest.txt repeats: {string.Join(", ", duplicates)}.");
    }

    [Fact]
    public void Every_migration_follows_the_date_and_snake_case_naming_rule()
    {
        var offenders = ManifestEntries()
            .Where(name => !NamingConvention.IsMatch(name))
            .ToArray();

        Assert.True(
            offenders.Length == 0,
            $"These entries are not YYYY-MM-DD_lower_snake.sql: {string.Join(", ", offenders)}.");
    }

    [Fact]
    public void Manifest_keeps_chronological_order_so_diffs_stay_reviewable()
    {
        var entries = ManifestEntries();
        var sorted = entries.OrderBy(name => name, StringComparer.Ordinal).ToArray();

        Assert.Equal(sorted, entries);
    }

    [Fact]
    public void Ledger_ddl_keys_the_table_by_migration_file_name()
    {
        var ddl = File.ReadAllText(RepoLayout.Resolve("SQL", "schema_migrations_ledger.sql"));

        Assert.Contains("CREATE TABLE IF NOT EXISTS schema_migrations", ddl, StringComparison.Ordinal);
        Assert.Contains("migration_key TEXT PRIMARY KEY", ddl, StringComparison.Ordinal);
    }

    [Fact]
    public void Ledger_ddl_seeds_no_applied_state()
    {
        // No environment has recorded its migrations yet, so a seeded row would be an invented fact.
        // Only executable SQL counts: the file is expected to document the recording procedure in
        // comments, and that documentation must not be mistaken for a seed.
        var ddl = WithoutSqlLineComments(File.ReadAllText(RepoLayout.Resolve("SQL", "schema_migrations_ledger.sql")));

        Assert.DoesNotContain("INSERT INTO schema_migrations", ddl, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Status_script_is_read_only_and_reads_the_same_manifest()
    {
        var script = WithoutShellComments(File.ReadAllText(RepoLayout.Resolve("scripts", "db-migration-status.sh")));

        Assert.Contains("SQL/migrations/manifest.txt", script, StringComparison.Ordinal);
        Assert.DoesNotContain("INSERT INTO schema_migrations", script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("UPDATE schema_migrations", script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DELETE FROM schema_migrations", script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DROP TABLE", script, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Drops everything from <c>--</c> to end of line. A literal <c>--</c> inside a quoted string
    /// would be misread, and no file here contains one.
    /// </summary>
    private static string WithoutSqlLineComments(string sql) =>
        string.Join('\n', sql.Split('\n').Select(line =>
        {
            var marker = line.IndexOf("--", StringComparison.Ordinal);
            return marker >= 0 ? line[..marker] : line;
        }));

    /// <summary>Drops shell comment lines, which are allowed to document write commands.</summary>
    private static string WithoutShellComments(string script) =>
        string.Join('\n', script.Split('\n').Where(line => !line.TrimStart().StartsWith('#')));

    [Fact]
    public void Status_script_is_executable()
    {
        var path = RepoLayout.Resolve("scripts", "db-migration-status.sh");

        Assert.True(File.Exists(path), $"Missing {path}.");

        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var mode = File.GetUnixFileMode(path);
        Assert.True(
            mode.HasFlag(UnixFileMode.UserExecute),
            "scripts/db-migration-status.sh must be executable for the documented usage.");
    }
}
