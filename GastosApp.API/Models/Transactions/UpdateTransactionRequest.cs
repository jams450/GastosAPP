using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class UpdateTransactionRequest
{
    [Range(1, int.MaxValue)]
    public int? CategoryId { get; set; }
    [Range(1, int.MaxValue)]
    public int? SubcategoryId { get; set; }
    [Range(1, int.MaxValue)]
    public int? MerchantId { get; set; }
    public bool ClearAnalytics { get; set; }
    public IEnumerable<string>? Tags { get; set; }

    [Range(0.01, double.MaxValue)]
    public decimal? Amount { get; set; }

    public string? Description { get; set; }

    public DateTimeOffset? TransactionDate { get; set; }

    public List<TransactionAllocationRequest>? Allocations { get; set; }

    public bool ReplaceAllocations { get; set; } = false;
}
