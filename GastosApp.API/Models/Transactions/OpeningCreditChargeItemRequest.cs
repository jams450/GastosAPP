using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class OpeningCreditChargeItemRequest
{
    [Range(0.01, 999999999)]
    public decimal Amount { get; set; }

    [Range(1, 60)]
    public int Months { get; set; } = 1;

    [StringLength(250)]
    public string? Description { get; set; }

    public DateTimeOffset? OccurredAt { get; set; }
}
