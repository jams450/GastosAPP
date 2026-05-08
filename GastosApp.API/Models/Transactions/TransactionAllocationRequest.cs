using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class TransactionAllocationRequest
{
    [Required]
    public int BillablePartyId { get; set; }

    [Required]
    [RegularExpression("^(percentage|amount)$", ErrorMessage = "Type must be 'percentage' or 'amount'")]
    public string Type { get; set; } = "percentage";

    [Range(0.0001, double.MaxValue)]
    public decimal Value { get; set; }
}
