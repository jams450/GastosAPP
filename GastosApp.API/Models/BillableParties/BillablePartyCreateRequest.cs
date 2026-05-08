using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.BillableParties;

public class BillablePartyCreateRequest
{
    [Required]
    [RegularExpression("^(self|system_user|external_person)$")]
    public string Type { get; set; } = "external_person";

    public int? LinkedUserId { get; set; }

    [Required]
    [MaxLength(120)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(400)]
    public string? Notes { get; set; }
}
