namespace GastosApp.API.Models.BillableParties;

public class BillablePartyResponse
{
    public int BillablePartyId { get; set; }
    public int OwnerUserId { get; set; }
    public int? LinkedUserId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public bool Active { get; set; }
    public string? Notes { get; set; }
}
