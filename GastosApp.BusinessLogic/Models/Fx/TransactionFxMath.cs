namespace GastosApp.BusinessLogic.Models.Fx;

/// <summary>
/// Resuelve el importe consolidado de un movimiento y deja la tasa en una forma que la tabla pueda
/// guardar sin mentir.
/// </summary>
/// <remarks>
/// Es una función pura por la misma razón que <see cref="FxRateSelection"/>: el redondeo de dinero es
/// donde se esconden los céntimos perdidos, y aquí se puede fijar con pruebas sin base de datos. La
/// regla que no se puede equivocar es que <c>BalanceImpact</c> salga del importe <b>en pesos</b>: el
/// saldo de la cuenta se calcula con <c>SUM(balance_impact)</c>, así que dejar ahí el importe en dólares
/// descuadraría la cuenta por el tipo de cambio.
/// </remarks>
public static class TransactionFxMath
{
    /// <summary>Divisa base del sistema: todo se consolida a ella.</summary>
    public const string BaseCurrencyCode = "MXN";

    public static bool IsBase(string? currencyCode) =>
        string.Equals(currencyCode?.Trim(), BaseCurrencyCode, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Importe en la divisa base: el mismo importe para la base, o <c>amount * fxRate</c> redondeado a
    /// dos decimales para una divisa extranjera.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// La divisa es extranjera y no trae una tasa positiva. Se falla en lugar de asumir 1: un importe
    /// convertido a tasa 1 pasaría por válido y solo se notaría al revisar los totales.
    /// </exception>
    public static decimal ComputeAmountMxn(decimal amount, string? currencyCode, decimal? fxRate)
    {
        if (IsBase(currencyCode))
        {
            // Copia exacta, no multiplicación por 1: multiplicar abriría la puerta a que el redondeo
            // cambie un importe en pesos al capturarlo.
            return amount;
        }

        if (fxRate is null || fxRate <= 0m)
        {
            throw new InvalidOperationException(
                "Una transacción en divisa extranjera requiere un tipo de cambio positivo.");
        }

        // AwayFromZero y no el redondeo bancario por defecto: al convertir dinero se espera que medio
        // centavo suba, no que se alterne según el dígito par.
        return Math.Round(amount * fxRate.Value, 2, MidpointRounding.AwayFromZero);
    }

    /// <summary>
    /// Tasa que debe persistirse. En la divisa base es <c>null</c> aunque el llamador mande 1: la base
    /// no se convierte contra sí misma y no existe una fecha de publicación que citar.
    /// </summary>
    public static decimal? NormalizeFxRate(string? currencyCode, decimal? fxRate) =>
        IsBase(currencyCode) ? null : fxRate;

    /// <summary>Fecha de la tasa que debe persistirse; nula en la divisa base, por la misma razón.</summary>
    public static DateOnly? NormalizeFxRateDate(string? currencyCode, DateOnly? fxRateDate) =>
        IsBase(currencyCode) ? null : fxRateDate;

    /// <summary>
    /// Comprueba el par tasa/fecha antes de escribir, para responder con un mensaje entendible en lugar
    /// de con la violación del <c>CHECK</c> de Postgres.
    /// </summary>
    /// <exception cref="InvalidOperationException">Falta la tasa, falta la fecha o la tasa no es positiva.</exception>
    public static void EnsureRateIsUsable(decimal? fxRate, DateOnly? fxRateDate)
    {
        if (fxRate is null || fxRate <= 0m)
        {
            throw new InvalidOperationException(
                "Una transacción en divisa extranjera requiere un tipo de cambio positivo.");
        }

        if (fxRateDate is null)
        {
            throw new InvalidOperationException(
                "Una transacción en divisa extranjera requiere la fecha del tipo de cambio usado.");
        }
    }
}
