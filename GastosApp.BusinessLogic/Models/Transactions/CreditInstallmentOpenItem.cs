namespace GastosApp.BusinessLogic.Models.Transactions
{
    public class CreditInstallmentOpenItem
    {
        public int InstallmentId { get; set; }
        public int PlanId { get; set; }
        public string PlanType { get; set; } = "Revolving";
        public int InstallmentNumber { get; set; }
        public int Months { get; set; }
        public DateTime DueDate { get; set; }
        public decimal TotalDue { get; set; }
        public decimal PaidAmount { get; set; }
        public decimal RemainingAmount { get; set; }
        public int SourceTransactionId { get; set; }
        public string Description { get; set; } = string.Empty;
    }
}
