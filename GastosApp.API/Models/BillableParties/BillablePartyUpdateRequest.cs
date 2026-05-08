using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.BillableParties;

public class BillablePartyUpdateRequest
{
    [RegularExpression("^(self|system_user|external_person)$")]
    public string? Type { get; set; }

    public int? LinkedUserId { get; set; }

    [MaxLength(120)]
    public string? DisplayName { get; set; }

    [MaxLength(400)]
    public string? Notes { get; set; }

    public bool? Active { get; set; }
}
