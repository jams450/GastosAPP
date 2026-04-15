namespace GastosApp.API.Models.Transactions;

public class UpdateTransferRequest
{
    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public int? MerchantId { get; set; }
    public string? Description { get; set; }
    public DateTime? TransactionDate { get; set; }
    public IEnumerable<string>? Tags { get; set; }
}
