using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class BancoppelImportCommitRequest
{
    [Required]
    public int AccountId { get; set; }

    [Required]
    [MinLength(1)]
    [MaxLength(1000)]
    public List<BancoppelImportCommitRowRequest> Rows { get; set; } = [];
}

public class BancoppelImportCommitRowRequest
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

    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public int? MerchantId { get; set; }
    [MaxLength(25)]
    public IEnumerable<string>? Tags { get; set; }
}
