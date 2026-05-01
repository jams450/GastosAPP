namespace GastosApp.BusinessLogic.Models.Transactions
{
    public class OpeningCreditChargeInput
    {
        public int CategoryId { get; set; }
        public decimal Amount { get; set; }
        public int Months { get; set; } = 1;
        public string? Description { get; set; }
        public DateTime? OccurredAt { get; set; }
    }
}
