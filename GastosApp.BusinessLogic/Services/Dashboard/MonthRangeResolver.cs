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
        /// Periodo <c>yyyy-MM</c> del mes en curso en <paramref name="timezoneId"/> (default
        /// <see cref="DefaultTimezoneId"/>). Única fuente de "mes actual" para la caducidad del
        /// comprometido: nunca usar <c>DateTime.Now</c> ni truncado local.
        /// </summary>
        public static string CurrentPeriodKey(string? timezoneId = null)
        {
            var (year, month, _, _) = ResolveUtcRange(null, timezoneId);
            return $"{year:D4}-{month:D2}";
        }

        /// <summary>
        /// Un periodo está abierto cuando es el mes en curso o uno futuro. La comparación es
        /// lexicográfica porque el formato <c>yyyy-MM</c> está rellenado con ceros. Al cerrar el mes,
        /// una partida <c>pending</c> deja de contar como comprometida.
        /// </summary>
        public static bool IsPeriodOpen(string? periodKey, string? timezoneId = null)
        {
            if (string.IsNullOrWhiteSpace(periodKey))
            {
                return false;
            }

            return string.CompareOrdinal(periodKey, CurrentPeriodKey(timezoneId)) >= 0;
        }

        /// <summary>Periodo <c>yyyy-MM</c> de una fecha. Única conversión fecha → periodo.</summary>
        public static string ToPeriodKey(DateTime date)
        {
            return $"{date.Year:D4}-{date.Month:D2}";
        }

        /// <summary>Periodo <c>yyyy-MM</c> siguiente al indicado. Valida el formato de entrada.</summary>
        public static string NextPeriodKey(string periodKey)
        {
            var (year, month, _, _) = ResolveUtcRange(periodKey, null);
            var next = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Unspecified).AddMonths(1);
            return ToPeriodKey(next);
        }

        /// <summary>Periodo <c>yyyy-MM</c> anterior al indicado. Valida el formato de entrada.</summary>
        public static string PreviousPeriodKey(string periodKey)
        {
            var (year, month, _, _) = ResolveUtcRange(periodKey, null);
            var previous = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Unspecified).AddMonths(-1);
            return ToPeriodKey(previous);
        }

        /// <summary>
        /// Fecha local (solo fecha) en <paramref name="timezoneId"/> correspondiente a
        /// <paramref name="utcInstant"/>. Fuente única del "hoy" del motor de programados: nunca
        /// <c>DateTime.Now</c> ni truncado del reloj del proceso, cuyo huso puede ser UTC y correría
        /// el día respecto de America/Mexico_City.
        /// </summary>
        public static DateTime ResolveLocalDate(DateTime utcInstant, string? timezoneId = null)
        {
            var timezone = ResolveTimeZone(timezoneId);
            var utc = utcInstant.Kind == DateTimeKind.Utc
                ? utcInstant
                : DateTime.SpecifyKind(utcInstant, DateTimeKind.Utc);
            var localNow = TimeZoneInfo.ConvertTimeFromUtc(utc, timezone);
            return DateTime.SpecifyKind(localNow.Date, DateTimeKind.Unspecified);
        }

        /// <summary>
        /// Fecha (solo fecha, sin zona) del día <paramref name="dayOfMonth"/> dentro de
        /// <paramref name="periodKey"/>. Si el mes no tiene ese día (31 en febrero), devuelve el
        /// <b>último día del mes</b>: regla explícita de sección 4.6 regla 2, nunca un desborde
        /// silencioso al mes siguiente. Única implementación del ajuste en todo el código.
        /// </summary>
        /// <remarks>
        /// Devuelve <see cref="DateOnly"/> a propósito: <c>budget_items.planned_date</c> es <c>date</c>
        /// y <see cref="DateOnly"/> es el tipo que Npgsql mapea nativamente a <c>date</c>. Un
        /// <see cref="DateTime"/> con <c>Kind=Unspecified</c> que llegue crudo a un parámetro de SQL
        /// se infiere como <c>timestamp with time zone</c> y Npgsql lo rechaza; convertirlo a UTC para
        /// evitar el rechazo es peor, porque el cast a <c>date</c> usa el huso de la sesión y corre el
        /// día (2026-09-30T00:00Z en America/Mexico_City cae a 2026-09-29).
        /// </remarks>
        public static DateOnly ResolveDayOfMonthInPeriod(string periodKey, int dayOfMonth)
        {
            if (dayOfMonth < 1)
            {
                throw new ArgumentException("dayOfMonth must be at least 1.", nameof(dayOfMonth));
            }

            var (year, month, _, _) = ResolveUtcRange(periodKey, null);
            var clamped = Math.Min(dayOfMonth, DateTime.DaysInMonth(year, month));

            return new DateOnly(year, month, clamped);
        }

        /// <summary>
        /// Medianoche local de <paramref name="localDate"/> expresada en UTC. Es la conversión
        /// permitida para escribir <c>transactions.transaction_date</c> desde una fecha local:
        /// <c>DateTime.ToUniversalTime</c> asume el huso del proceso y el contenedor corre en UTC,
        /// lo que retrocedería el día (y a veces el mes) en America/Mexico_City.
        /// </summary>
        public static DateTime ToUtc(DateTime localDate, string? timezoneId = null)
        {
            var timezone = ResolveTimeZone(timezoneId);
            var unspecified = DateTime.SpecifyKind(localDate.Date, DateTimeKind.Unspecified);
            return DateTime.SpecifyKind(TimeZoneInfo.ConvertTimeToUtc(unspecified, timezone), DateTimeKind.Utc);
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
