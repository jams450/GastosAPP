namespace GastosApp.API.Models.Subcategories;

public class SubcategoryResponse
{
    public int SubcategoryId { get; set; }
    public int? UserId { get; set; }
    public int CategoryId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string NormalizedName { get; set; } = string.Empty;
    public bool Active { get; set; }
}
