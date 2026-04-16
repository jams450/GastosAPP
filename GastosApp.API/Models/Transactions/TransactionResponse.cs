namespace GastosApp.API.Models.Transactions;

public class TransactionResponse
{
    public int TransactionId { get; set; }
    public int AccountId { get; set; }
    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public int? MerchantId { get; set; }
    public string Type { get; set; } = string.Empty;
    public Guid? TransferGroupId { get; set; }
    public decimal Amount { get; set; }
    public decimal BalanceImpact { get; set; }
    public string? Direction { get; set; }
    public int? CounterpartyAccountId { get; set; }
    public string? Description { get; set; }
    public DateTime TransactionDate { get; set; }
    public IEnumerable<string> Tags { get; set; } = Array.Empty<string>();
}
