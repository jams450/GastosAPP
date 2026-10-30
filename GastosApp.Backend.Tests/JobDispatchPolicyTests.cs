using GastosApp.API.Services.Jobs;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the alert-dispatch rules that were moved out of the worker when the run had to become
/// monitorable (S1/L5).
/// <para>
/// The extraction is only safe if the numbers do not move: a failing delivery is retried with an
/// exponential backoff that is capped, gives up at <c>Alerts:MaxAttempts</c> with the stable code
/// <c>max_attempts</c>, and stale pending rows expire after seven days with the code
/// <c>expired</c>. Those three values are what an operator reads in the outbox, so they are fixed
/// here instead of being trusted to a refactor.
/// </para>
/// <para>
/// The EF batch loop itself needs PostgreSQL and is not covered by a unit test; what is covered is
/// every decision the loop makes, plus the exact expiry statement.
/// </para>
/// </summary>
public class JobDispatchPolicyTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void The_backoff_doubles_from_half_a_minute_and_never_passes_the_cap()
    {
        Assert.Equal(TimeSpan.FromSeconds(60), AlertDispatchPolicy.Backoff(1));
        Assert.Equal(TimeSpan.FromSeconds(120), AlertDispatchPolicy.Backoff(2));
        Assert.Equal(TimeSpan.FromSeconds(240), AlertDispatchPolicy.Backoff(3));

        // Attempt 6 would be 1920s on its own: the cap wins.
        Assert.Equal(AlertDispatchPolicy.MaxBackoff, AlertDispatchPolicy.Backoff(6));
        Assert.Equal(AlertDispatchPolicy.MaxBackoff, AlertDispatchPolicy.Backoff(50));
        Assert.Equal(TimeSpan.FromMinutes(30), AlertDispatchPolicy.MaxBackoff);
    }

    [Fact]
    public void The_backoff_curve_is_monotonic_across_the_whole_attempt_range()
    {
        var previous = TimeSpan.Zero;

        for (var attempts = 1; attempts <= 20; attempts++)
        {
            var backoff = AlertDispatchPolicy.Backoff(attempts);
            Assert.True(backoff >= previous, $"Backoff went backwards at attempt {attempts}.");
            Assert.True(backoff <= AlertDispatchPolicy.MaxBackoff);
            previous = backoff;
        }
    }

    [Fact]
    public void A_failure_before_the_last_attempt_is_rescheduled_with_the_exception_type()
    {
        var decision = AlertDispatchPolicy.Decide(attempts: 2, maxAttempts: 5, errorType: "HttpRequestException", Now);

        Assert.False(decision.ShouldFail);
        Assert.Equal("HttpRequestException", decision.LastError);
        Assert.Equal(Now + TimeSpan.FromSeconds(120), decision.NextAttemptAt);
    }

    [Fact]
    public void The_attempt_that_reaches_the_limit_fails_the_row_with_a_stable_code()
    {
        var decision = AlertDispatchPolicy.Decide(attempts: 5, maxAttempts: 5, errorType: "HttpRequestException", Now);

        Assert.True(decision.ShouldFail);
        Assert.Equal("max_attempts", decision.LastError);
        Assert.Null(decision.NextAttemptAt);
    }

    [Fact]
    public void The_stored_error_is_truncated_to_the_column_width()
    {
        var longType = new string('x', 800);

        var truncated = AlertDispatchPolicy.Truncate(longType);

        Assert.Equal(500, truncated.Length);
        Assert.Equal("Short", AlertDispatchPolicy.Truncate("Short"));
    }

    [Fact]
    public void The_expiry_statement_only_touches_pending_rows_older_than_seven_days()
    {
        var sql = AlertDispatchPolicy.ExpireStalePendingSql;

        Assert.Contains("UPDATE alert_outbox", sql, StringComparison.Ordinal);
        Assert.Contains("status = 'failed'", sql, StringComparison.Ordinal);
        Assert.Contains("last_error = 'expired'", sql, StringComparison.Ordinal);
        Assert.Contains("WHERE status = 'pending'", sql, StringComparison.Ordinal);
        Assert.Contains("INTERVAL '7 days'", sql, StringComparison.Ordinal);

        // No other status is rewritten: a sent or already failed row is history, not garbage.
        Assert.DoesNotContain("DELETE", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("sent", sql, StringComparison.OrdinalIgnoreCase);
    }
}
