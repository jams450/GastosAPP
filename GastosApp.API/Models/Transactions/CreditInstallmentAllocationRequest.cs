using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class CreditInstallmentAllocationRequest
{
    [Required]
    public int InstallmentId { get; set; }

    [Required]
    [Range(0.01, double.MaxValue)]
    public decimal Amount { get; set; }
}
