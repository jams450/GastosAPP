using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Merchants;

public class MerchantCreateRequest
{
    [Required]
    [StringLength(120, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    public bool Active { get; set; } = true;
}
