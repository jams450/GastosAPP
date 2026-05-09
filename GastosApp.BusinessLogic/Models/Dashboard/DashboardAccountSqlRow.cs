namespace GastosApp.BusinessLogic.Models.Dashboard
{
    public sealed class DashboardAccountSqlRow
    {
        public int AccountId { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool Active { get; set; }
        public bool IsCredit { get; set; }
        public int? CutoffDay { get; set; }
        public int? PaymentDueDay { get; set; }
        public decimal InitialBalance { get; set; }
        public decimal CurrentBalance { get; set; }
        public decimal OpeningBalance { get; set; }
        public decimal MonthIncome { get; set; }
        public decimal MonthExpense { get; set; }
        public decimal MonthNet { get; set; }
        public decimal ClosingBalance { get; set; }
        public decimal? CreditLimit { get; set; }
        public DateTime? PeriodStart { get; set; }
        public DateTime? PeriodEnd { get; set; }
        public decimal PeriodSpent { get; set; }
        public decimal EstimatedCutoffPayment { get; set; }
        public decimal MsiOutstanding { get; set; }
        public decimal NormalOutstanding { get; set; }
    }
}
