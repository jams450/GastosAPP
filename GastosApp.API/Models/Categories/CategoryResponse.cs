namespace GastosApp.API.Models.Categories;

public class CategoryResponse
{
    public int CategoryId { get; set; }
    public int? UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#000000";
    public string Type { get; set; } = "expense";
    public bool Active { get; set; }
    public IEnumerable<string> Tags { get; set; } = Array.Empty<string>();
}
