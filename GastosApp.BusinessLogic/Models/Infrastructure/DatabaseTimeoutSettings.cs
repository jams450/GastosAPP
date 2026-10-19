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

    /// <summary>
    /// Upper bound applied to a configured value. The finding this type answers was an unbounded
    /// wait, and a value large enough to outlive the process is that same failure wearing a number:
    /// <c>int.MaxValue</c> seconds is about 68 years. A typo such as <c>999999</c> passes a
    /// "greater than zero" check silently, so the guard is a range, not a sign test.
    /// </summary>
    public const int MaxCommandTimeoutSeconds = 300;

    public int CommandTimeoutSeconds { get; init; } = DefaultCommandTimeoutSeconds;

    /// <summary>
    /// The value to apply, always inside <c>[1, MaxCommandTimeoutSeconds]</c>. An unset, zero or
    /// negative setting falls back to <see cref="DefaultCommandTimeoutSeconds"/> and an oversized one
    /// is capped, so no configuration can disable the timeout or push it beyond usefulness.
    /// </summary>
    public int EffectiveCommandTimeoutSeconds
    {
        get
        {
            if (CommandTimeoutSeconds <= 0)
            {
                return DefaultCommandTimeoutSeconds;
            }

            return CommandTimeoutSeconds > MaxCommandTimeoutSeconds
                ? MaxCommandTimeoutSeconds
                : CommandTimeoutSeconds;
        }
    }
}
