namespace GastosApp.API.Models.Fx;

/// <summary>
/// Tasa vigente en una fecha concreta, ya resuelta con carry-forward.
/// <para>
/// <see cref="RequestedDate"/> y <see cref="RateDate"/> se devuelven juntas a propósito: cuando difieren,
/// la interfaz puede avisar que se está usando la última tasa publicada en lugar de una del día. Sin esa
/// distinción, una conversión en sábado parecería usar una tasa de sábado que nunca existió.
/// </para>
/// </summary>
public class ResolvedFxRateResponse
{
    public string CurrencyCode { get; set; } = string.Empty;
    public DateOnly RequestedDate { get; set; }
    public DateOnly RateDate { get; set; }
    public decimal RateMxn { get; set; }
    public string Source { get; set; } = string.Empty;
    public bool IsCarryForward { get; set; }
}
