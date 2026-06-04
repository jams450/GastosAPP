namespace GastosApp.BusinessLogic.Models.Dashboard
{
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
        public decimal CurrentBalance { get; set; }
        public decimal MonthIncome { get; set; }
        public decimal MonthExpense { get; set; }
        public decimal MonthTransferIn { get; set; }
        public decimal MonthTransferOut { get; set; }
        public decimal MonthNet { get; set; }
        public decimal ClosingBalance { get; set; }
        public decimal? CreditLimit { get; set; }
        public DateTime? PeriodStart { get; set; }
        public DateTime? PeriodEnd { get; set; }
        public decimal PeriodSpent { get; set; }
        public decimal EstimatedCutoffCharges { get; set; }
        public decimal CutoffPayments { get; set; }
        public decimal CutoffPending { get; set; }
        public decimal MsiOutstanding { get; set; }
        public decimal NormalOutstanding { get; set; }
    }

    public class DashboardOverviewResponse
    {
        public string Month { get; set; } = string.Empty;
        public string Timezone { get; set; } = string.Empty;
        public DashboardGeneralSummary GeneralSummary { get; set; } = new();
        public DashboardCharts Charts { get; set; } = new();
        public DashboardCreditSectionSummary CreditSummary { get; set; } = new();
        public DashboardCashSectionSummary CashSummary { get; set; } = new();
        public IEnumerable<DashboardAccountOverview> Accounts { get; set; } = Enumerable.Empty<DashboardAccountOverview>();
    }

    public class DashboardGeneralSummary
    {
        public decimal MonthIncome { get; set; }
        public decimal MonthExpense { get; set; }
    }

    public class DashboardCharts
    {
        public IEnumerable<DashboardBreakdownItem> ExpenseByCategory { get; set; } = Enumerable.Empty<DashboardBreakdownItem>();
        public IEnumerable<DashboardBreakdownItem> ExpenseBySubcategory { get; set; } = Enumerable.Empty<DashboardBreakdownItem>();
        public IEnumerable<DashboardBreakdownItem> IncomeByAccount { get; set; } = Enumerable.Empty<DashboardBreakdownItem>();
        public IEnumerable<DashboardBreakdownItem> ExpenseByAccount { get; set; } = Enumerable.Empty<DashboardBreakdownItem>();
        public IEnumerable<DashboardBreakdownItem> TransferInByAccount { get; set; } = Enumerable.Empty<DashboardBreakdownItem>();
        public IEnumerable<DashboardBreakdownItem> TransferOutByAccount { get; set; } = Enumerable.Empty<DashboardBreakdownItem>();
    }

    public class DashboardBreakdownItem
    {
        public int? Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public decimal Amount { get; set; }
    }

    public class DashboardCreditSectionSummary
    {
        public decimal TotalAvailable { get; set; }
        public decimal MonthIncome { get; set; }
        public decimal MonthExpense { get; set; }
        public decimal MonthNet { get; set; }
        public decimal TransferIn { get; set; }
        public decimal TransferOut { get; set; }
        public decimal MonthMsiExpense { get; set; }
        public decimal MonthNormalExpense { get; set; }
        public decimal PendingMsi { get; set; }
        public decimal PendingNormal { get; set; }
    }

    public class DashboardCashSectionSummary
    {
        public decimal Total { get; set; }
        public decimal MonthIncome { get; set; }
        public decimal MonthExpense { get; set; }
        public decimal MonthNet { get; set; }
    }
}
