using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Tags;

public class TagCreateRequest
{
    [Required]
    [StringLength(80, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;

    public bool Active { get; set; } = true;
}
