namespace GastosApp.API.Services.Email;

/// <summary>
/// Calcula cuánto falta para la próxima corrida diaria del pase de etiquetado.
/// </summary>
/// <remarks>
/// Función pura, separada del <c>Task.Delay</c>, para fijar el borde que convierte un job diario en un
/// ciclo cerrado: si la hora objetivo ya pasó —o es exactamente ahora— la espera es hasta mañana y
/// nunca cero. El job además espera ANTES de su primera corrida, sin trabajo de arranque.
/// </remarks>
public static class EmailIngestSchedule
{
    /// <summary>
    /// Tiempo hasta la próxima ocurrencia de <paramref name="hourUtc"/>, en UTC.
    /// </summary>
    /// <param name="nowUtc">Instante actual, en UTC.</param>
    /// <param name="hourUtc">Hora objetivo del día; se acota a 0–23.</param>
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

        // <= y no <: si son exactamente las 12:00 la corrida de hoy ya ocurrió, así que toca mañana.
        if (next <= nowUtc)
        {
            next = next.AddDays(1);
        }

        return next - nowUtc;
    }
}
