using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class UpdateTransferRequest
{
    [Range(1, int.MaxValue)]
    public int? CategoryId { get; set; }
    [Range(1, int.MaxValue)]
    public int? SubcategoryId { get; set; }
    [Range(1, int.MaxValue)]
    public int? MerchantId { get; set; }
    public bool ClearAnalytics { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset? TransactionDate { get; set; }
    public IEnumerable<string>? Tags { get; set; }
}
