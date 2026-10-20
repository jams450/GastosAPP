namespace GastosApp.API.Services.Fx;

/// <summary>
/// Calcula cuánto falta para la próxima corrida diaria.
/// </summary>
/// <remarks>
/// Función pura para poder fijar el borde que rompe un <c>Task.Delay</c> mal escrito: si ya pasó la hora,
/// la espera es hasta mañana y no cero (una espera de cero produce un ciclo cerrado de descargas).
/// </remarks>
public static class FxSyncSchedule
{
    /// <summary>
    /// Tiempo hasta la próxima ocurrencia de <paramref name="hourUtc"/>, en UTC.
    /// </summary>
    /// <param name="nowUtc">Instante actual. Debe venir en UTC.</param>
    /// <param name="hourUtc">Hora objetivo del día, entre 0 y 23.</param>
    public static TimeSpan DelayUntilNextRun(DateTimeOffset nowUtc, int hourUtc)
    {
        var hour = Math.Clamp(hourUtc, 0, 23);

        var next = new DateTimeOffset(
            nowUtc.Year,
            nowUtc.Month,
            nowUtc.Day,
            hour,
            0,
            0,
            TimeSpan.Zero);

        // <= y no <: si son exactamente las 22:00 la corrida de hoy ya ocurrió, así que toca mañana.
        if (next <= nowUtc)
        {
            next = next.AddDays(1);
        }

        return next - nowUtc;
    }
}
