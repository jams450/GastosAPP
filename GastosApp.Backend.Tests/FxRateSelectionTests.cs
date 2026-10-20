using GastosApp.BusinessLogic.Models.Fx;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the carry-forward rule chosen for missing rates (M8).
/// <para>
/// Banxico publishes only on business days, so a Saturday expense has no rate of its own. The rule is
/// to use the last published rate at or before the requested date, and to report which date's rate was
/// used so the movement can show it. These tests fix the edges that are easy to get wrong: the exact
/// hit, the weekend gap, the future date, and an empty table.
/// </para>
/// </summary>
public class FxRateSelectionTests
{
    private static readonly FxRatePoint[] Published =
    [
        new(new DateOnly(2026, 10, 15), 17.10m), // jueves
        new(new DateOnly(2026, 10, 16), 17.25m), // viernes
        new(new DateOnly(2026, 10, 19), 17.40m)  // lunes
    ];

    [Fact]
    public void Una_fecha_con_tasa_publicada_usa_la_suya()
    {
        var resolved = FxRateSelection.Resolve(new DateOnly(2026, 10, 16), Published);

        Assert.NotNull(resolved);
        Assert.Equal(new DateOnly(2026, 10, 16), resolved!.RateDate);
        Assert.Equal(17.25m, resolved.RateMxn);
    }

    [Fact]
    public void Un_sabado_usa_el_viernes_y_lo_declara()
    {
        // Fin de semana: no hay publicación, se arrastra la última.
        var resolved = FxRateSelection.Resolve(new DateOnly(2026, 10, 17), Published);

        Assert.NotNull(resolved);
        Assert.Equal(new DateOnly(2026, 10, 16), resolved!.RateDate);
        Assert.Equal(17.25m, resolved.RateMxn);
    }

    [Fact]
    public void Un_domingo_tambien_usa_el_viernes()
    {
        var resolved = FxRateSelection.Resolve(new DateOnly(2026, 10, 18), Published);

        Assert.Equal(new DateOnly(2026, 10, 16), resolved!.RateDate);
    }

    [Fact]
    public void Nunca_usa_una_tasa_futura()
    {
        // Pedir el día 17 no puede tomar la tasa del 19: sería inventar el futuro.
        var resolved = FxRateSelection.Resolve(new DateOnly(2026, 10, 17), Published);

        Assert.True(resolved!.RateDate < new DateOnly(2026, 10, 19));
    }

    [Fact]
    public void Antes_de_la_primera_publicacion_no_hay_tasa()
    {
        // Sin historia previa no se inventa nada: null es la respuesta honesta.
        Assert.Null(FxRateSelection.Resolve(new DateOnly(2026, 10, 14), Published));
    }

    [Fact]
    public void Una_tabla_vacia_no_produce_tasa()
    {
        Assert.Null(FxRateSelection.Resolve(new DateOnly(2026, 10, 16), []));
    }

    [Fact]
    public void El_orden_de_entrada_no_importa()
    {
        FxRatePoint[] unordered = [Published[2], Published[0], Published[1]];

        var resolved = FxRateSelection.Resolve(new DateOnly(2026, 10, 18), unordered);

        Assert.Equal(new DateOnly(2026, 10, 16), resolved!.RateDate);
    }

    [Theory]
    [InlineData(100.00, 17.25, 2, 1725.00)]
    [InlineData(50.00, 17.255, 2, 862.75)]
    [InlineData(1, 17.255, 2, 17.26)]     // redondeo away-from-zero, como el resto del dinero
    [InlineData(1000, 1, 2, 1000.00)]     // divisa base: tasa 1
    [InlineData(0, 17.25, 2, 0.00)]       // sin importe no hay conversión
    public void La_conversion_redondea_a_los_decimales_de_la_divisa(decimal amount, decimal rate, int decimals, decimal expected)
    {
        Assert.Equal(expected, FxRateSelection.Convert(amount, rate, decimals));
    }

    [Fact]
    public void El_yen_sin_decimales_no_produce_centavos()
    {
        // ISO 4217: JPY tiene 0 decimales, así que 100 USD a 0.115 JPY/USD son 12 yenes, no 11.5.
        var converted = FxRateSelection.Convert(100m, 0.115m, 0);

        Assert.Equal(12m, converted);
        Assert.Equal(decimal.Truncate(converted), converted);
    }

    [Fact]
    public void Una_tasa_no_positiva_es_un_error_no_un_cero()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => FxRateSelection.Convert(100m, 0m, 2));
        Assert.Throws<ArgumentOutOfRangeException>(() => FxRateSelection.Convert(100m, -1m, 2));
    }
}
