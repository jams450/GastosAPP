using System.Globalization;

namespace GastosApp.BusinessLogic.Services.Investments;

/// <summary>
/// Month classification for the investment module, anchored to <c>America/Mexico_City</c>.
/// The monthly plan is a calendar month, so every decision (which offers are eligible, which
/// month a plan belongs to) uses the same operating month regardless of the server's host
/// timezone. This is intentionally small and separate from the dashboard resolver: the dashboard
/// resolves a UTC billing range for an arbitrary timezone, while investments only need the local
/// calendar month and its first day. Dashboard behavior is not affected.
/// </summary>
public static class InvestmentMonthResolver
{
    public const string TimezoneId = "America/Mexico_City";

    private static TimeZoneInfo Timezone => TimeZoneInfo.FindSystemTimeZoneById(TimezoneId);

    /// <summary>Calendar year and month of the operating month right now.</summary>
    public static (int Year, int Month) CurrentMonth()
    {
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Timezone);
        return (localNow.Year, localNow.Month);
    }

    /// <summary>Operating month right now as a <c>yyyy-MM</c> key.</summary>
    public static string CurrentMonthKey()
    {
        var (year, month) = CurrentMonth();
        return $"{year:D4}-{month:D2}";
    }

    /// <summary>Validates and trims a <c>yyyy-MM</c> key.</summary>
    public static string Normalize(string? month)
    {
        if (month is null || !DateTime.TryParseExact(month.Trim(), "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
        {
            throw new ArgumentException("Month must use yyyy-MM format.");
        }

        return month.Trim();
    }

    /// <summary>First calendar day of a validated <c>yyyy-MM</c> month.</summary>
    public static DateOnly StartDate(string month)
    {
        var parsed = DateTime.ParseExact(Normalize(month), "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None);
        return new DateOnly(parsed.Year, parsed.Month, 1);
    }

    /// <summary>Last calendar day of the calendar year that contains <paramref name="month"/>.</summary>
    public static DateOnly EndOfCaptureYear(string month)
    {
        var parsed = DateTime.ParseExact(Normalize(month), "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None);
        return new DateOnly(parsed.Year, 12, 31);
    }
}
