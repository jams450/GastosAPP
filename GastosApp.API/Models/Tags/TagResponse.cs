namespace GastosApp.API.Models.Tags;

public class TagResponse
{
    public int TagId { get; set; }
    public int? UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string NormalizedName { get; set; } = string.Empty;
    public bool Active { get; set; }
}
