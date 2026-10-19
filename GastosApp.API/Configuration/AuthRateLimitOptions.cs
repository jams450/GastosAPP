namespace GastosApp.API.Configuration;

/// <summary>
/// Fixed-window budget for the public authentication endpoints, which are the only unauthenticated
/// surface of this application.
/// <para>
/// Per-account lockout already exists, but it is not a brute-force control: a password spray across
/// many accounts never touches one account's counter, and a rejected attempt costs the caller
/// nothing. This budget is what makes the attempt itself expensive.
/// </para>
/// </summary>
public sealed class AuthRateLimitOptions
{
    public const string PermitLimitKey = "RateLimit:Auth:PermitLimit";
    public const string WindowSecondsKey = "RateLimit:Auth:WindowSeconds";

    public const int DefaultPermitLimit = 10;
    public const int DefaultWindowSeconds = 60;

    public int PermitLimit { get; init; } = DefaultPermitLimit;

    public int WindowSeconds { get; init; } = DefaultWindowSeconds;

    /// <summary>
    /// Always at least 1: a configured 0 would reject every login, including the legitimate one,
    /// which is a lockout of the application itself rather than a security policy.
    /// </summary>
    public int EffectivePermitLimit => PermitLimit > 0 ? PermitLimit : DefaultPermitLimit;

    public TimeSpan EffectiveWindow =>
        TimeSpan.FromSeconds(WindowSeconds > 0 ? WindowSeconds : DefaultWindowSeconds);
}
