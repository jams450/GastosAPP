using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class CreateTransactionRequest
{
    [Required]
    public int AccountId { get; set; }

    public int? CategoryId { get; set; }

    public int? SubcategoryId { get; set; }

    public int? MerchantId { get; set; }

    public IEnumerable<string>? Tags { get; set; }

    [Required]
    [Range(0.01, double.MaxValue)]
    public decimal Amount { get; set; }

    public string? Description { get; set; }

    [Required]
    public DateTime TransactionDate { get; set; }
}
