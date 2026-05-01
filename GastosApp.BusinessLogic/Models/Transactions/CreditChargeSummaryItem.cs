namespace GastosApp.BusinessLogic.Models.Transactions
{
    public class CreditChargeSummaryItem
    {
        public int SourceTransactionId { get; set; }
        public int Months { get; set; }
        public decimal RemainingAmount { get; set; }
        public string Status { get; set; } = "Open";
    }
}
