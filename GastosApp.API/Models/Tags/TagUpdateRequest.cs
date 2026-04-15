using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Tags;

public class TagUpdateRequest
{
    [Required]
    [StringLength(80, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;

    public bool Active { get; set; } = true;
}
