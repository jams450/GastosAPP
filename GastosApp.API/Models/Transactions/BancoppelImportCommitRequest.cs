using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class BancoppelImportCommitRequest
{
    [Range(1, int.MaxValue)]
    public int AccountId { get; set; }

    [Required]
    [MinLength(1)]
    [MaxLength(1000)]
    public List<BancoppelImportCommitRowRequest> Rows { get; set; } = [];
}

public class BancoppelImportCommitRowRequest : IValidatableObject
{
    [Required]
    public DateTimeOffset TransactionDate { get; set; }

    [Range(0.01, double.MaxValue)]
    public decimal Amount { get; set; }

    [Required]
    [MaxLength(300)]
    public string Type { get; set; } = string.Empty;

    [Required]
    [MaxLength(600)]
    public string Description { get; set; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int? CategoryId { get; set; }
    [Range(1, int.MaxValue)]
    public int? SubcategoryId { get; set; }
    [Range(1, int.MaxValue)]
    public int? MerchantId { get; set; }
    [MaxLength(25)]
    public IEnumerable<string>? Tags { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (TransactionDate == default)
        {
            yield return new ValidationResult(
                "TransactionDate is required.",
                [nameof(TransactionDate)]);
        }
    }
}
