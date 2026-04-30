using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class ConvertChargeToMsiRequest
{
    [Required]
    public int SourceTransactionId { get; set; }

    [Required]
    [Range(2, 60)]
    public int Months { get; set; }
}
