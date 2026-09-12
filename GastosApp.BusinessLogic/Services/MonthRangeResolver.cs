using System.Globalization;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>
    /// Resolves a yyyy-MM month to a half-open UTC range [start, nextStart) anchored in a timezone.
    /// Keeps dashboard and transaction history on the same month boundaries.
    /// </summary>
    public static class MonthRangeResolver
    {
        public const string DefaultTimezoneId = "America/Mexico_City";
        private const string FallbackTimezoneId = "Central Standard Time (Mexico)";

        public static TimeZoneInfo ResolveTimeZone(string? timezoneId)
        {
            var id = string.IsNullOrWhiteSpace(timezoneId) ? DefaultTimezoneId : timezoneId!;

            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
                return TimeZoneInfo.FindSystemTimeZoneById(FallbackTimezoneId);
            }
        }

        /// <summary>
        /// Returns the month to display plus its UTC boundaries. When <paramref name="month"/> is
        /// empty the current month in <paramref name="timezoneId"/> is used.
        /// </summary>
        public static (int Year, int Month, DateTime StartUtc, DateTime NextStartUtc) ResolveUtcRange(string? month, string? timezoneId)
        {
            var timezone = ResolveTimeZone(timezoneId);
            int year;
            int monthNumber;

            if (!string.IsNullOrWhiteSpace(month))
            {
                if (!DateTime.TryParseExact(month, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                {
                    throw new ArgumentException("Month must use yyyy-MM format.");
                }

                year = parsed.Year;
                monthNumber = parsed.Month;
            }
            else
            {
                var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone);
                year = localNow.Year;
                monthNumber = localNow.Month;
            }

            var startLocal = new DateTime(year, monthNumber, 1, 0, 0, 0, DateTimeKind.Unspecified);

            return (
                year,
                monthNumber,
                TimeZoneInfo.ConvertTimeToUtc(startLocal, timezone),
                TimeZoneInfo.ConvertTimeToUtc(startLocal.AddMonths(1), timezone));
        }
    }
}
