namespace GastosApp.BusinessLogic.Models.Dashboard
{
    public class DashboardCreditOverview
    {
        public string Month { get; set; } = string.Empty;
        public string Timezone { get; set; } = string.Empty;
        public DashboardSummary Summary { get; set; } = new();
        public IEnumerable<DashboardAccountOverview> Accounts { get; set; } = Enumerable.Empty<DashboardAccountOverview>();
    }

    public class DashboardSummary
    {
        public decimal CashTotal { get; set; }
        public decimal CreditUsed { get; set; }
        public decimal TotalDebt { get; set; }
        public decimal MonthIncome { get; set; }
        public decimal MonthExpense { get; set; }
    }

    public class DashboardAccountOverview
    {
        public int AccountId { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool Active { get; set; }
        public bool IsCredit { get; set; }
        public int? CutoffDay { get; set; }
        public int? PaymentDueDay { get; set; }
        public decimal InitialBalance { get; set; }
        public decimal OpeningBalance { get; set; }
        public decimal MonthIncome { get; set; }
        public decimal MonthExpense { get; set; }
        public decimal MonthNet { get; set; }
        public decimal ClosingBalance { get; set; }
        public decimal? CreditLimit { get; set; }
        public DateTime? PeriodStart { get; set; }
        public DateTime? PeriodEnd { get; set; }
        public decimal PeriodSpent { get; set; }
        public decimal PendingInformative { get; set; }
    }
}
