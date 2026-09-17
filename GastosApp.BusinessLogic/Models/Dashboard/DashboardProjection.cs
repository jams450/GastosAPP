namespace GastosApp.BusinessLogic.Models.Dashboard
{
    public class DashboardProjectionResponse
    {
        public DateOnly AsOfDate { get; set; }
        public string Timezone { get; set; } = string.Empty;
        public int HorizonMonths { get; set; }
        public decimal CashRealBalance { get; set; }
        public IEnumerable<DashboardHistoricalMonth> HistoricalMonths { get; set; } = Enumerable.Empty<DashboardHistoricalMonth>();
        public DashboardProjectionTrend Trend { get; set; } = new();
        public IEnumerable<DashboardProjectionMonth> Months { get; set; } = Enumerable.Empty<DashboardProjectionMonth>();
        public IEnumerable<DashboardMsiPlan> MsiPlans { get; set; } = Enumerable.Empty<DashboardMsiPlan>();
    }

    public class DashboardHistoricalMonth
    {
        public string Month { get; set; } = string.Empty;
        public decimal Income { get; set; }
        public decimal Expense { get; set; }
        public decimal Net { get; set; }

        /// <summary>
        /// True sólo si el mes tiene movimientos registrados. False significa "sin historial",
        /// no un neto de cero: la UI no debe pintarlo como neto registrado.
        /// </summary>
        public bool HasActivity { get; set; }
    }

    public class DashboardProjectionTrend
    {
        public int SampleMonths { get; set; }
        public decimal MonthlyNetSlope { get; set; }
        public decimal ProjectedMonthlyNet { get; set; }
        public bool HasSufficientHistory { get; set; }
    }

    public class DashboardProjectionMonth
    {
        public string Month { get; set; } = string.Empty;
        public decimal ProjectedCashBalance { get; set; }
        public decimal ProjectedNet { get; set; }
        /// <summary>Compromiso MSI del mes: no es un expense/income real, sólo cuotas de crédito abiertas.</summary>
        public decimal MsiCommitment { get; set; }
        public decimal MsiPaymentScenarioBalance { get; set; }
    }

    public class DashboardMsiPlan
    {
        public int PlanId { get; set; }
        public int AccountId { get; set; }
        public string AccountName { get; set; } = string.Empty;

        /// <summary>
        /// Descripción del cargo fuente (<c>CreditCharge.SourceTransaction.Description</c>), sólo
        /// informativa. Se normaliza (trim + longitud máxima) y nunca contiene datos sensibles de
        /// configuración; es texto capturado por el propio usuario.
        /// </summary>
        public string Description { get; set; } = string.Empty;

        public decimal RemainingAmount { get; set; }
        public int OpenInstallments { get; set; }
        public DateTime? NextDueDate { get; set; }
        public decimal NextDueAmount { get; set; }
        public DateTime? EndsOn { get; set; }
        public bool ScheduleComplete { get; set; }
    }
}
