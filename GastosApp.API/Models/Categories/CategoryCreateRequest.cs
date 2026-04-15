using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Categories;

public class CategoryCreateRequest
{
    [Required]
    [StringLength(100, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [StringLength(7)]
    public string Color { get; set; } = "#000000";

    [Required]
    [RegularExpression("^(income|expense|transfer)$", ErrorMessage = "Type must be income, expense, or transfer")]
    public string Type { get; set; } = "expense";

    public bool Active { get; set; } = true;

    public IEnumerable<string>? Tags { get; set; }
}
