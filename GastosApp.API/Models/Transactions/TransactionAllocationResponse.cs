namespace GastosApp.API.Models.Transactions;

public class TransactionAllocationResponse
{
    public int TransactionAllocationId { get; set; }
    public int BillablePartyId { get; set; }
    public string BillablePartyName { get; set; } = string.Empty;
    public string AllocationMode { get; set; } = string.Empty;
    public decimal AllocationValue { get; set; }
    public decimal CalculatedAmount { get; set; }
}
