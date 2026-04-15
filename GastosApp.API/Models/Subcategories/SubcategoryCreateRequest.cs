using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Subcategories;

public class SubcategoryCreateRequest
{
    [Required]
    public int CategoryId { get; set; }

    [Required]
    [StringLength(100, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    public bool Active { get; set; } = true;
}
