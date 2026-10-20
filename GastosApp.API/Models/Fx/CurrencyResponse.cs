namespace GastosApp.API.Models.Fx;

public class CurrencyResponse
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Symbol { get; set; } = string.Empty;
    public short Decimals { get; set; }
    public bool IsBase { get; set; }
}
