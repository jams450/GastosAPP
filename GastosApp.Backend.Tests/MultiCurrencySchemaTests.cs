using System.Text.RegularExpressions;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the multi-currency foundation across the bootstrap schema and the dated migration.
/// <para>
/// There is no EF migration and the DDL is hand-written twice (fresh install plus incremental), so
/// drift between the two is the mistake worth catching. A second failure mode is storing the Banxico
/// series code as data: the series must stay in API configuration, because a wrong code has to be a
/// config change and the table must not become a second source of truth for the same fact.
/// </para>
/// <para>
/// Static on purpose: it holds without a database, so it runs on every build.
/// </para>
/// </summary>
public class MultiCurrencySchemaTests
{
    private const string MigrationFileName = "2026-10-19_multi_currency_fx_rates.sql";

    private static string MigrationPath => RepoLayout.Resolve("SQL", "migrations", MigrationFileName);

    private static string MigrationSql => Normalized(File.ReadAllText(MigrationPath));

    private static string SchemaSql => Normalized(File.ReadAllText(RepoLayout.Resolve("SQL", "schema.sql")));

    private static string Normalized(string sql) => Regex.Replace(sql, @"\s+", " ");

    [Fact]
    public void Migration_exists_and_is_registered_in_the_manifest()
    {
        Assert.True(File.Exists(MigrationPath), $"Missing migration {MigrationFileName}.");

        var manifest = File.ReadAllLines(Path.Combine(RepoLayout.Resolve("SQL", "migrations"), "manifest.txt"))
            .Select(line => line.Trim())
            .ToArray();

        Assert.Contains(MigrationFileName, manifest);
    }

    [Fact]
    public void Both_files_create_the_catalog_with_a_single_base_currency()
    {
        foreach (var sql in new[] { MigrationSql, SchemaSql })
        {
            Assert.Contains("CREATE TABLE IF NOT EXISTS currencies", sql);
            Assert.Contains("is_base BOOLEAN NOT NULL DEFAULT FALSE", sql);
            // Exactly one base currency, enforced by the database rather than by application code.
            Assert.Contains("CREATE UNIQUE INDEX IF NOT EXISTS uq_currencies_single_base ON currencies(is_base) WHERE is_base", sql);
        }
    }

    [Fact]
    public void Both_files_seed_the_same_six_currencies_with_correct_minor_units()
    {
        // ISO 4217: yen has no minor unit, everything else in this catalog has two.
        var expected = new[]
        {
            "('MXN', 'Peso mexicano', '$', 2, TRUE, TRUE)",
            "('USD', 'Dólar estadounidense', 'US$', 2, FALSE, TRUE)",
            "('EUR', 'Euro', '€', 2, FALSE, TRUE)",
            "('GBP', 'Libra esterlina', '£', 2, FALSE, TRUE)",
            "('CAD', 'Dólar canadiense', 'C$', 2, FALSE, TRUE)",
            "('JPY', 'Yen japonés', '¥', 0, FALSE, TRUE)"
        };

        foreach (var sql in new[] { MigrationSql, SchemaSql })
        {
            foreach (var row in expected)
            {
                Assert.Contains(row, sql);
            }

            Assert.Contains("ON CONFLICT (code) DO NOTHING", sql);
        }
    }

    [Fact]
    public void Rates_are_positive_and_keyed_by_currency_and_date()
    {
        foreach (var sql in new[] { MigrationSql, SchemaSql })
        {
            Assert.Contains("CREATE TABLE IF NOT EXISTS fx_rates", sql);
            Assert.Contains("rate_mxn DECIMAL(18, 8) NOT NULL", sql);
            Assert.Contains("PRIMARY KEY (currency_code, rate_date)", sql);
            Assert.Contains("CONSTRAINT chk_fx_rates_positive CHECK (rate_mxn > 0)", sql);
            // Provenance is a closed vocabulary so a manually corrected rate stays distinguishable.
            Assert.Contains("CONSTRAINT chk_fx_rates_source CHECK (source IN ('banxico', 'manual'))", sql);
            Assert.Contains("REFERENCES currencies(code)", sql);
        }
    }

    [Fact]
    public void Series_codes_are_configuration_not_data()
    {
        // C5: the Banxico series code must not live in the schema. A wrong code has to be a config
        // change, and the table must not drift into a second source of truth for the same fact.
        Assert.DoesNotContain("banxico_serie", MigrationSql);
        Assert.DoesNotContain("banxico_serie", SchemaSql);
        Assert.DoesNotContain("SF43718", MigrationSql);
        Assert.DoesNotContain("SF43718", SchemaSql);
    }

    [Fact]
    public void Migration_is_transactional_and_idempotent()
    {
        Assert.Contains("BEGIN;", MigrationSql);
        Assert.Contains("COMMIT;", MigrationSql);
        Assert.Contains("CREATE TABLE IF NOT EXISTS", MigrationSql);
        Assert.Contains("CREATE INDEX IF NOT EXISTS", MigrationSql);
        Assert.Contains("ON CONFLICT (code) DO NOTHING", MigrationSql);
    }
}
