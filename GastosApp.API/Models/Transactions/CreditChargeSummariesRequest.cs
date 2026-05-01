namespace GastosApp.API.Models.Transactions;

public class CreditChargeSummariesRequest
{
    public List<int> SourceTransactionIds { get; set; } = [];
}
