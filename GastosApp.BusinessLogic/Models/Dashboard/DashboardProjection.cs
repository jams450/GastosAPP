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

        /// <summary>
        /// Procedencia del ajuste por desviación histórica aplicado a <see cref="DashboardProjectionMonth.AdjustedEconomicNet"/>:
        /// ventana de meses candidatos, muestra realmente comparada y desglose con signo.
        /// </summary>
        public DashboardProjectionDeviation Deviation { get; set; } = new();
    }

    /// <summary>
    /// Procedencia del ajuste mensual: promedio del neto real menos el plan en los últimos meses
    /// completos. Sin las 3 observaciones válidas el ajuste es cero y se declara insuficiente; un mes
    /// válido con desviación cero sí cuenta como observación.
    /// </summary>
    public class DashboardProjectionDeviation
    {
        /// <summary>Meses candidatos de la ventana (los últimos completos), tenga o no plan comparable.</summary>
        public IReadOnlyList<string> WindowMonths { get; set; } = Array.Empty<string>();

        /// <summary>Meses que sí tenían plan con el cual comparar y entraron promedio.</summary>
        public IReadOnlyList<string> SampledMonths { get; set; } = Array.Empty<string>();

        /// <summary>Observaciones comparadas (meses con plan).</summary>
        public int SampleSize { get; set; }

        /// <summary>Observaciones que se exigen para ajustar: 3 meses completos.</summary>
        public int RequiredSampleSize { get; set; }

        /// <summary>True sólo si <see cref="SampleSize"/> cubre <see cref="RequiredSampleSize"/>.</summary>
        public bool HasSufficientSample { get; set; }

        /// <summary>Promedio mensual del neto real menos el plan, con signo (positivo = mejor que lo planeado). Cero si la muestra es insuficiente.</summary>
        public decimal MonthlyAdjustment { get; set; }

        /// <summary>Aporte promedio de ingresos: real menos planificado (con signo).</summary>
        public decimal IncomeDeviation { get; set; }

        /// <summary>Aporte promedio de gastos: planificado menos real (con signo; positivo = se gastó menos).</summary>
        public decimal ExpenseDeviation { get; set; }

        /// <summary>Aporte promedio de movimientos sin partida: ingreso no planeado menos gasto no planeado (con signo).</summary>
        public decimal UnplannedDeviation { get; set; }
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

        /// <summary>
        /// Origen del <see cref="ProjectedNet"/> del mes: <c>budget</c> cuando existe al menos una
        /// partida pendiente del periodo (el plan reemplaza la tendencia, incluso con montos en cero),
        /// <c>trend</c> cuando cae al histórico y hay muestra suficiente, o <c>none</c> sin historial.
        /// </summary>
        public string BudgetBasis { get; set; } = "none";

        /// <summary>Ingreso planificado pendiente del periodo (0 cuando no hay plan). No incluye MSI.</summary>
        public decimal BudgetIncome { get; set; }

        /// <summary>
        /// Gasto planificado pendiente del periodo (0 cuando no hay plan). Por convención del usuario
        /// las partidas de presupuesto excluyen cuotas MSI: éstas se restan aparte vía
        /// <see cref="MsiCommitment"/>, nunca dentro de este importe.
        /// </summary>
        public decimal BudgetExpense { get; set; }

        /// <summary>
        /// Rendimiento estimado del mes según el plan de inversión persistido aplicable. Es un
        /// estimado, no una transacción ni efectivo líquido: nunca se suma a
        /// <see cref="ProjectedCashBalance"/>.
        /// </summary>
        public decimal InvestmentEstimate { get; set; }

        /// <summary>Mes del plan persistido que aportó <see cref="InvestmentEstimate"/>; null si ninguno cubre el mes.</summary>
        public string? InvestmentSourcePlanMonth { get; set; }

        /// <summary>
        /// Neto económico estimado del mes: <see cref="ProjectedNet"/> menos <see cref="MsiCommitment"/>
        /// más <see cref="InvestmentEstimate"/>. La MSI se deduce exactamente una vez aquí.
        /// Campo heredado (T2): conserva exactamente su definición previa y <b>no</b> descuenta
        /// <see cref="NormalCreditPayment"/>; el neto vigente es <see cref="BaseEconomicNet"/>.
        /// </summary>
        public decimal EstimatedEconomicNet { get; set; }

        /// <summary>
        /// Pago de crédito normal (Revolving) del mes: suma del pendiente completo de las cuotas
        /// abiertas con vencimiento en el mes. Se resta exactamente una vez del neto económico base.
        /// </summary>
        public decimal NormalCreditPayment { get; set; }

        /// <summary>
        /// Origen de la base del neto económico: <c>budget</c> (plan pendiente del periodo),
        /// <c>trend</c> (línea base histórica de efectivo <b>sin</b> traspasos de liquidación de
        /// crédito) o <c>none</c>. Puede diferir de <see cref="BudgetBasis"/>, que describe el
        /// <see cref="ProjectedNet"/> heredado.
        /// </summary>
        public string BaseEconomicBasis { get; set; } = "none";

        /// <summary>
        /// Neto económico base del mes = base (presupuesto o histórico) + <see cref="InvestmentEstimate"/>
        /// − <see cref="MsiCommitment"/> − <see cref="NormalCreditPayment"/>. En el fallback histórico se
        /// usa la línea base sin traspasos de liquidación de crédito, por lo que las obligaciones no se
        /// restan dos veces.
        /// </summary>
        public decimal BaseEconomicNet { get; set; }

        /// <summary>Ajuste por desviación histórica aplicado al mes (mismo valor en todo el horizonte).</summary>
        public decimal DeviationAdjustment { get; set; }

        /// <summary>Neto económico ajustado del mes = <see cref="BaseEconomicNet"/> + <see cref="DeviationAdjustment"/>.</summary>
        public decimal AdjustedEconomicNet { get; set; }
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
