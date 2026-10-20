namespace GastosApp.BusinessLogic.Models.Fx;

/// <summary>
/// Una tasa lista para mostrarse: qué divisa, de qué fecha y de dónde salió.
/// </summary>
/// <remarks>
/// Existe para que la capa de lectura no devuelva entidades de EF. La fecha viaja junto con la tasa
/// porque es la única forma de que la interfaz pueda decir "esta tasa es del viernes": sin ella, un
/// importe convertido en sábado parecería usar una tasa del sábado que Banxico nunca publicó.
/// </remarks>
public sealed record FxRateQuote(string CurrencyCode, DateOnly RateDate, decimal RateMxn, string Source)
{
    /// <summary>
    /// <c>true</c> cuando la tasa no se publicó en la fecha pedida y hubo que usar la última anterior.
    /// </summary>
    public bool IsCarryForward(DateOnly requestedDate) => RateDate != requestedDate;
}
