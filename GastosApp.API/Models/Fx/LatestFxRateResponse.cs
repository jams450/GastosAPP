namespace GastosApp.API.Models.Fx;

/// <summary>Última tasa conocida de una divisa. La fecha es la de publicación, no la de la consulta.</summary>
public class LatestFxRateResponse
{
    public string CurrencyCode { get; set; } = string.Empty;
    public DateOnly RateDate { get; set; }
    public decimal RateMxn { get; set; }
    public string Source { get; set; } = string.Empty;
}
