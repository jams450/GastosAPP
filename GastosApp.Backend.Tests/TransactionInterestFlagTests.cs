using System.Text.RegularExpressions;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the interest-income flag across the four places it has to agree: the bootstrap schema, the
/// dated migration, the EF entity and the API DTOs.
/// <para>
/// This solution has no EF migrations and no shared contract generation, so the flag lives in four
/// hand-written files. The failure mode worth catching is drift: a column that exists in the
/// database but not in the response DTO, or an entity property mapped to a column nobody created.
/// The checks are static on purpose — they hold without a database, so they run on every build.
/// </para>
/// </summary>
public class TransactionInterestFlagTests
{
    private const string MigrationFileName = "2026-10-19_transaction_interest_flag.sql";
    private const string ColumnName = "is_interest";

    private static string MigrationPath => RepoLayout.Resolve("SQL", "migrations", MigrationFileName);

    private static string SchemaSql => File.ReadAllText(RepoLayout.Resolve("SQL", "schema.sql"));

    private static string MigrationSql => File.ReadAllText(MigrationPath);

    private static string EntitySource =>
        File.ReadAllText(RepoLayout.Resolve("GastosApp.Models", "Entities", "Transaction.cs"));

    private static string DtoSource(string fileName) =>
        File.ReadAllText(RepoLayout.Resolve("GastosApp.API", "Models", "Transactions", fileName));

    private static string ControllerSource =>
        File.ReadAllText(RepoLayout.Resolve("GastosApp.API", "Controllers", "TransactionsController.cs"));

    private static string CommandServiceSource =>
        File.ReadAllText(RepoLayout.Resolve(
            "GastosApp.BusinessLogic",
            "Services",
            "Transactions",
            "TransactionCommandService.cs"));

    private static string Normalized(string sql) => Regex.Replace(sql, @"\s+", " ");

    [Fact]
    public void Migration_file_exists_and_is_registered_in_the_manifest()
    {
        Assert.True(File.Exists(MigrationPath), $"Missing migration {MigrationFileName}.");

        var manifest = File.ReadAllLines(Path.Combine(RepoLayout.Resolve("SQL", "migrations"), "manifest.txt"))
            .Select(line => line.Trim())
            .ToArray();

        Assert.Contains(MigrationFileName, manifest);
    }

    [Fact]
    public void Migration_adds_the_flag_idempotently_and_constrains_it_to_income()
    {
        var sql = Normalized(MigrationSql);

        // Re-runnable: applying it twice must not fail.
        Assert.Contains($"ADD COLUMN IF NOT EXISTS {ColumnName} BOOLEAN NOT NULL DEFAULT FALSE", sql);
        Assert.Contains("DROP CONSTRAINT IF EXISTS", sql);
        Assert.Matches(@"CHECK \(is_interest = FALSE OR type = 'income'\)", sql);
    }

    [Fact]
    public void Bootstrap_schema_declares_the_same_column_and_constraint()
    {
        var sql = Normalized(SchemaSql);

        Assert.Contains(ColumnName, sql);
        Assert.Matches(@"ADD COLUMN IF NOT EXISTS is_interest BOOLEAN NOT NULL DEFAULT FALSE", sql);
        Assert.Matches(@"CHECK \(is_interest = FALSE OR type = 'income'\)", sql);
    }

    [Fact]
    public void Bootstrap_schema_does_not_widen_the_transaction_type_vocabulary()
    {
        // El flag es aditivo: `type` gobierna el signo del saldo y el motor de transferencias.
        Assert.Matches(
            @"type VARCHAR\(20\) NOT NULL CHECK \(type IN \('income', 'expense', 'transfer', 'opening_credit', 'transfer_in', 'transfer_out'\)\)",
            Normalized(SchemaSql));
    }

    [Fact]
    public void Entity_maps_the_property_to_the_column()
    {
        Assert.Matches(@"\[Column\(""is_interest""\)\]", EntitySource);
        Assert.Matches(@"public bool IsInterest \{ get; set; \}", EntitySource);
    }

    [Fact]
    public void Api_dtos_carry_the_flag_on_create_update_and_response()
    {
        Assert.Matches(@"public bool IsInterest \{ get; set; \}", DtoSource("CreateTransactionRequest.cs"));
        Assert.Matches(@"public bool\? IsInterest \{ get; set; \}", DtoSource("UpdateTransactionRequest.cs"));
        Assert.Matches(@"public bool IsInterest \{ get; set; \}", DtoSource("TransactionResponse.cs"));
    }

    [Fact]
    public void Controller_projects_the_flag_into_the_response()
    {
        Assert.Matches(@"IsInterest = transaction\.IsInterest", ControllerSource);
    }

    [Fact]
    public void Income_write_path_rejects_the_flag_for_accounts_that_do_not_earn_interest()
    {
        // La UI solo ofrece el interruptor cuando la cuenta devenga interés; el servicio lo
        // vuelve a comprobar para que la regla no dependa del cliente.
        Assert.Contains("EarnsInterest", CommandServiceSource);
    }
}
