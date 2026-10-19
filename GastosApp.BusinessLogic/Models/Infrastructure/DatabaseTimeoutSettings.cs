namespace GastosApp.BusinessLogic.Models.Infrastructure;

/// <summary>
/// Bounds how long a single database command may run.
/// <para>
/// EF Core and Npgsql read a command timeout of <c>0</c> as "wait forever". That is the one value
/// this type will never apply: a stalled query, a lock wait, or a half-open connection then hangs
/// the request or the background worker instead of failing, and no caller's <c>try/catch</c> can
/// observe a call that never returns.
/// </para>
/// <para>
/// A plain POCO registered as a singleton, matching the settings convention already used in this
/// solution (<c>RecurringItemSettings</c>, <c>PlanMatchSettings</c>, <c>BudgetEvaluationSettings</c>):
/// BusinessLogic deliberately does not reference Microsoft.Extensions.Options.
/// </para>
/// </summary>
public sealed class DatabaseTimeoutSettings
{
    /// <summary>Configuration key read by the API composition root: <c>Database:CommandTimeoutSeconds</c>.</summary>
    public const int DefaultCommandTimeoutSeconds = 30;

    public int CommandTimeoutSeconds { get; init; } = DefaultCommandTimeoutSeconds;

    /// <summary>
    /// The value to apply. Always positive: an unset, zero or negative setting falls back to
    /// <see cref="DefaultCommandTimeoutSeconds"/> instead of disabling the timeout.
    /// </summary>
    public int EffectiveCommandTimeoutSeconds =>
        CommandTimeoutSeconds > 0 ? CommandTimeoutSeconds : DefaultCommandTimeoutSeconds;
}
