using GastosApp.BusinessLogic.Models.Fx;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the money math that converts a movement to the base currency.
/// <para>
/// The failure this prevents is silent: account balances come from <c>SUM(balance_impact)</c>, so leaving
/// a dollar amount in that column understates or overstates the account by the exchange rate, and every
/// total downstream inherits the error. The rounding rule is fixed too, because half a cent per movement
/// accumulates into a visible discrepancy over a month.
/// </para>
/// </summary>
public class TransactionFxMathTests
{
    [Fact]
    public void Un_importe_en_la_divisa_base_se_guarda_sin_tocar()
    {
        Assert.Equal(1234.56m, TransactionFxMath.ComputeAmountMxn(1234.56m, "MXN", fxRate: null));
    }

    [Fact]
    public void La_divisa_base_ignora_una_tasa_uno_del_contrato()
    {
        // El contrato expone fxRate = 1 para la base; persistir esa tasa sería inventar una fecha.
        Assert.Equal(1234.56m, TransactionFxMath.ComputeAmountMxn(1234.56m, "MXN", 1m));
    }

    [Fact]
    public void Una_divisa_extranjera_se_multiplica_por_la_tasa()
    {
        Assert.Equal(1725.00m, TransactionFxMath.ComputeAmountMxn(100m, "USD", 17.25m));
    }

    [Fact]
    public void El_medio_centavo_sube_y_no_se_reparte_por_paridad()
    {
        // 100 * 17.255 = 1725.50 exacto; 1 * 17.255 = 17.255, que debe subir a 17.26 y no bajar a 17.25.
        Assert.Equal(1725.50m, TransactionFxMath.ComputeAmountMxn(100m, "USD", 17.255m));
        Assert.Equal(17.26m, TransactionFxMath.ComputeAmountMxn(1m, "USD", 17.255m));
    }

    [Fact]
    public void Un_importe_pequeno_conserva_sus_centavos()
    {
        Assert.Equal(0.17m, TransactionFxMath.ComputeAmountMxn(0.01m, "USD", 17.255m));
    }

    [Fact]
    public void Una_divisa_extranjera_sin_tasa_falla_en_vez_de_asumir_uno()
    {
        var withoutRate = Assert.Throws<InvalidOperationException>(
            () => TransactionFxMath.ComputeAmountMxn(100m, "USD", fxRate: null));
        var zeroRate = Assert.Throws<InvalidOperationException>(
            () => TransactionFxMath.ComputeAmountMxn(100m, "USD", 0m));
        var negativeRate = Assert.Throws<InvalidOperationException>(
            () => TransactionFxMath.ComputeAmountMxn(100m, "USD", -17.25m));

        Assert.Contains("tipo de cambio", withoutRate.Message);
        Assert.Contains("tipo de cambio", zeroRate.Message);
        Assert.Contains("tipo de cambio", negativeRate.Message);
    }

    [Theory]
    [InlineData("mxn")]
    [InlineData(" MXN ")]
    [InlineData("Mxn")]
    public void La_divisa_base_se_reconoce_sin_importar_mayusculas_ni_espacios(string currencyCode)
    {
        Assert.True(TransactionFxMath.IsBase(currencyCode));
        Assert.Null(TransactionFxMath.NormalizeFxRate(currencyCode, 1m));
    }

    [Fact]
    public void La_tasa_de_una_divisa_extranjera_se_conserva_tal_cual()
    {
        Assert.Equal(17.25m, TransactionFxMath.NormalizeFxRate("USD", 17.25m));
        Assert.Null(TransactionFxMath.NormalizeFxRate("USD", fxRate: null));
    }

    [Fact]
    public void La_fecha_de_la_tasa_solo_se_guarda_cuando_hay_tasa()
    {
        var date = new DateOnly(2026, 10, 16);

        Assert.Equal(date, TransactionFxMath.NormalizeFxRateDate("USD", date));
        Assert.Null(TransactionFxMath.NormalizeFxRateDate("MXN", date));
    }

    [Fact]
    public void El_par_tasa_fecha_se_valida_antes_de_escribir()
    {
        var date = new DateOnly(2026, 10, 16);

        // Caso válido: no lanza.
        TransactionFxMath.EnsureRateIsUsable(17.25m, date);

        Assert.Throws<InvalidOperationException>(() => TransactionFxMath.EnsureRateIsUsable(null, date));
        Assert.Throws<InvalidOperationException>(() => TransactionFxMath.EnsureRateIsUsable(0m, date));
        Assert.Throws<InvalidOperationException>(() => TransactionFxMath.EnsureRateIsUsable(17.25m, null));
    }
}
