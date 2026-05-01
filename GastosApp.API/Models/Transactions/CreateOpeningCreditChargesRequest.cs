using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class CreateOpeningCreditChargesRequest
{
    [Required]
    public int CreditAccountId { get; set; }

    [Required]
    [MinLength(1)]
    public List<OpeningCreditChargeItemRequest> Items { get; set; } = [];
}
