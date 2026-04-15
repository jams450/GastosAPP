namespace GastosApp.API.Models.Merchants;

public class MerchantResponse
{
    public int MerchantId { get; set; }
    public int? UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string NormalizedName { get; set; } = string.Empty;
    public bool Active { get; set; }
}
