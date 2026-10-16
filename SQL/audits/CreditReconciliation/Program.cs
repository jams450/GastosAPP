using System.Data;
using System.Text.Json;
using Npgsql;

// Run from repository root. No connection is made without the explicit flag.
if (args.Length != 1 || args[0] != "--read-production")
{
    Console.Error.WriteLine("Usage: dotnet run --project SQL/audits/CreditReconciliation -- --read-production");
    return 2;
}
NpgsqlConnection? connection = null;
NpgsqlTransaction? transaction = null;
try
{
    var env = File.ReadLines(".env").Where(l => !l.TrimStart().StartsWith('#') && l.Contains('='))
        .Select(l => l.Split('=', 2)).ToDictionary(p => p[0].Trim(), p => p[1].Trim().Trim('"', '\''));
    var builder = new NpgsqlConnectionStringBuilder(env["ConnectionStrings__DefaultConnection"])
    {
        Timeout = 10, CommandTimeout = 30, Pooling = false,
        ApplicationName = "credit-reconciliation-read-only",
        Options = "-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=60000"
    };
    connection = new NpgsqlConnection(builder.ConnectionString);
    await connection.OpenAsync();
    transaction = await connection.BeginTransactionAsync(IsolationLevel.RepeatableRead);
    async Task<List<Dictionary<string, object?>>> Read(string sql, int? userId = null)
    {
        await using var cmd = new NpgsqlCommand(sql, connection, transaction) { CommandTimeout = 30 };
        if (userId.HasValue) cmd.Parameters.AddWithValue("user_id", userId.Value);
        await using var reader = await cmd.ExecuteReaderAsync();
        var rows = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync())
        {
            var row = new Dictionary<string, object?>();
            for (var i = 0; i < reader.FieldCount; i++) row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            rows.Add(row);
        }
        return rows;
    }
    var safety = (await Read("SELECT current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation, current_setting('statement_timeout') AS timeout, current_database() AS database, transaction_timestamp() AS snapshot_at"))[0];
    if ((string)safety["database"]! != "gastos_db")
        throw new InvalidOperationException("Database identity differs from the confirmed target; financial read refused.");
    if ((string)safety["read_only"]! != "on" || (string)safety["isolation"]! != "repeatable read")
        throw new InvalidOperationException("Transaction safety settings were not established.");
    // Do not select an arbitrary owner or expose another owner's accounts.
    var owners = await Read("SELECT DISTINCT user_id FROM accounts WHERE is_credit = TRUE ORDER BY user_id");
    if (owners.Count != 1) throw new InvalidOperationException($"Owner selection required: {owners.Count} credit-account owners. No financial rows read.");
    var owner = Convert.ToInt32(owners[0]["user_id"]);
    var sql = await File.ReadAllTextAsync("SQL/audits/credit_reconciliation.sql");
    var rows = await Read(sql.Replace(":user_id", "@user_id"), owner);
    decimal Number(Dictionary<string, object?> r, string key) => r[key] is null
        ? throw new InvalidOperationException($"Missing required numeric field: {key}. No financial result certified.")
        : Convert.ToDecimal(r[key]);
    if (rows.Select(r => r["account_id"]).Distinct().Count() != rows.Count) throw new InvalidOperationException("Duplicate account rows.");
    foreach (var r in rows)
    {
        if (Number(r, "total_debt") != Number(r, "normal_debt") + Number(r, "msi_debt")) throw new InvalidOperationException("Debt arithmetic mismatch.");
        if (Number(r, "persisted_residual") != Number(r, "current_balance") - Number(r, "initial_balance") - Number(r, "persisted_impact")) throw new InvalidOperationException("Residual arithmetic mismatch.");
        if (r["credit_limit"] != null && Number(r, "available") != Number(r, "credit_limit") - Number(r, "total_debt")) throw new InvalidOperationException("Available arithmetic mismatch.");
        if (Number(r, "cross_account_allocations") != 0) throw new InvalidOperationException("Cross-account posted allocations require investigation.");
    }
    // Independent base-table totals: no movement/debt join, so fanout cannot hide.
    var source = (await Read("""
        SELECT (SELECT count(*) FROM accounts WHERE user_id=@user_id AND is_credit) AS account_count,
          (SELECT count(*) FROM transactions t JOIN accounts a ON a.account_id=t.account_id WHERE a.user_id=@user_id AND a.is_credit) AS movement_count,
          (SELECT coalesce(sum(t.balance_impact),0) FROM transactions t JOIN accounts a ON a.account_id=t.account_id WHERE a.user_id=@user_id AND a.is_credit) AS persisted_impact
        """, owner))[0];
    if (Number(source,"account_count") != rows.Count || Number(source,"movement_count") != rows.Sum(r=>Number(r,"movement_count")) || Number(source,"persisted_impact") != rows.Sum(r=>Number(r,"persisted_impact")))
        throw new InvalidOperationException("Independent source totals mismatch.");
    var canonical = await Read("""
        WITH d AS (SELECT date_trunc('month',transaction_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS m),
        dates AS (SELECT m, m+interval '1 month' AS n, m-interval '1 month' AS p FROM d)
        SELECT f."AccountId", f."NormalOutstanding", f."MsiOutstanding"
        FROM dates, LATERAL fn_dashboard_credit_overview(@user_id,m,n,
          extract(year from m)::int,extract(month from m)::int,extract(day from n-interval '1 day')::int,
          extract(year from p)::int,extract(month from p)::int,extract(day from m-interval '1 day')::int) f
        WHERE f."IsCredit"
        """, owner);
    foreach (var r in rows.Where(r => (bool)r["active"]!))
    {
        var c = canonical.SingleOrDefault(c => Convert.ToInt32(c["AccountId"]) == Convert.ToInt32(r["account_id"]));
        if (c == null || Number(c,"NormalOutstanding") != Number(r,"normal_debt") || Number(c,"MsiOutstanding") != Number(r,"msi_debt"))
            throw new InvalidOperationException("Deployed dashboard debt disagrees with reconciliation.");
    }
    var functionDefinition = (await Read("SELECT md5(pg_get_functiondef(p.oid)) AS definition_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_dashboard_credit_overview'"));
    // Always roll back before reporting success or writing a local report.
    await transaction.RollbackAsync();
    transaction = null;
    var totals = new[] {"initial_balance","current_balance","persisted_impact","persisted_residual","normal_debt","msi_debt","total_debt","overallocated","paid_status_residual"}
        .ToDictionary(k => k, k => rows.Sum(r => Number(r,k)));
    var report = new { safety, owner_id = owner, source_checks = source, dashboard_function = functionDefinition,
        canonical_active_accounts_checked = canonical.Count, totals, accounts = rows, rollback = "completed" };
    Directory.CreateDirectory("artifacts/credit-reconciliation");
    await File.WriteAllTextAsync("artifacts/credit-reconciliation/snapshot.json", JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine($"PASS: {rows.Count} credit accounts; source totals and deployed active dashboard debts agree; transaction rolled back. Private report: artifacts/credit-reconciliation/snapshot.json");
    return 0;
}
catch (Exception ex)
{
    // Never echo connection strings, authentication details, SQL or server error detail.
    if (transaction != null) { try { await transaction.RollbackAsync(); } catch { } }
    Console.Error.WriteLine(ex is InvalidOperationException ? ex.Message : $"Read blocked: {ex.GetType().Name}. No success report produced; no retry attempted.");
    return 1;
}
finally
{
    if (transaction != null) await transaction.DisposeAsync();
    if (connection != null) await connection.DisposeAsync();
}
