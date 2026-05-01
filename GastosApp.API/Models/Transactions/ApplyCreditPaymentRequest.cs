using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class ApplyCreditPaymentRequest
{
    [Required]
    public int SourceTransactionId { get; set; }

    [Required]
    public int CreditAccountId { get; set; }

    public decimal? Amount { get; set; }
}
