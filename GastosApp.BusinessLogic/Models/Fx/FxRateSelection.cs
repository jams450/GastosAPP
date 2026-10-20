namespace GastosApp.BusinessLogic.Models.Fx;

/// <summary>
/// Regla de selección y conversión de tipos de cambio. Pura y sin dependencias, para poder probarla
/// sin base de datos ni red.
/// <para>
/// Banxico publica tipos de cambio <b>solo en días hábiles bancarios</b>, así que la mayoría de los
/// fines de semana y feriados no tienen tasa propia. La regla acordada es arrastrar la última tasa
/// publicada en o antes de la fecha pedida, y reportar <b>qué fecha se usó</b> para que el movimiento
/// pueda mostrarla en lugar de aparentar que la tasa es del día.
/// </para>
/// <para>
/// Nunca se toma una tasa posterior a la fecha pedida: eso sería inventar el futuro. Si no hay ninguna
/// tasa anterior, la respuesta honesta es <c>null</c>, no un cero ni la primera tasa disponible.
/// </para>
/// </summary>
public static class FxRateSelection
{
    /// <summary>
    /// Última tasa publicada en o antes de <paramref name="requestedDate"/>, o <c>null</c> si no hay
    /// ninguna. El orden de entrada es irrelevante.
    /// </summary>
    public static FxRatePoint? Resolve(DateOnly requestedDate, IEnumerable<FxRatePoint> published)
    {
        ArgumentNullException.ThrowIfNull(published);

        FxRatePoint? best = null;
        foreach (var point in published)
        {
            if (point.RateDate > requestedDate)
            {
                continue;
            }

            if (best is null || point.RateDate > best.RateDate)
            {
                best = point;
            }
        }

        return best;
    }

    /// <summary>
    /// Convierte a la divisa base: <c>importe × tasa</c> redondeado a los decimales de esa divisa.
    /// </summary>
    /// <remarks>
    /// Redondea con <see cref="MidpointRounding.AwayFromZero"/>, igual que el resto del dinero en este
    /// servicio. Una tasa no positiva es un error y no un cero: multiplicar por cero produciría un
    /// movimiento silenciosamente sin importe.
    /// </remarks>
    public static decimal Convert(decimal amount, decimal rateMxn, int decimals)
    {
        if (rateMxn <= 0m)
        {
            throw new ArgumentOutOfRangeException(nameof(rateMxn), rateMxn, "La tasa de cambio debe ser mayor a cero.");
        }

        if (decimals is < 0 or > 4)
        {
            throw new ArgumentOutOfRangeException(nameof(decimals), decimals, "Los decimales de la divisa deben estar entre 0 y 4.");
        }

        return Math.Round(amount * rateMxn, decimals, MidpointRounding.AwayFromZero);
    }
}
