namespace GastosApp.BusinessLogic.Models.Transactions;

public class ExpenseAllocationInput
{
    public int BillablePartyId { get; set; }
    public string Type { get; set; } = "percentage";
    public decimal Value { get; set; }
}
