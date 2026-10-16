using GastosApp.BusinessLogic.Models.Dashboard;
using GastosApp.BusinessLogic.Models.Investments;
using GastosApp.BusinessLogic.Services.Investments;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>Plan pendiente de un periodo, agregado por tipo. Es la base del mes cuando existe.</summary>
    public sealed record DashboardBudgetMonthBasis(string Month, decimal Income, decimal Expense, int ItemCount);

    /// <summary>Rendimiento estimado de un mes y el plan persistido que lo aportó.</summary>
    public sealed record DashboardInvestmentMonthEstimate(string Month, decimal Estimate, string? SourcePlanMonth);

    /// <summary>Serie mensual de intereses ya resuelta para un plan persistido.</summary>
    public sealed record DashboardInvestmentPlanSnapshot(
        string PlanMonth,
        int ProjectionMonths,
        IReadOnlyList<DashboardInvestmentAllocationSnapshot> Allocations);

    /// <summary>Saldo asignado y escalones marginales de una asignación persistida.</summary>
    public sealed record DashboardInvestmentAllocationSnapshot(
        decimal AllocatedAmount,
        IReadOnlyList<MarginalRateTier> Tiers);

    /// <summary>Resultado puro del cálculo: tendencia y meses proyectados.</summary>
    public sealed class DashboardProjectionCalculation
    {
        public DashboardProjectionTrend Trend { get; init; } = new();
        public List<DashboardProjectionMonth> Months { get; init; } = [];
    }

    /// <summary>
    /// Clasificación de una partida <c>pending</c> respecto al efectivo, según la cuenta asignada.
    /// </summary>
    public enum DashboardPendingPlanCash
    {
        /// <summary>Cuenta de efectivo, o sin cuenta asignada (por convención sigue contando como efectivo).</summary>
        Cash,

        /// <summary>Cuenta de crédito: la partida es una compra financiada, no un flujo de efectivo.</summary>
        FinancedCredit,

        /// <summary>ID con cuenta no resoluble en el alcance del usuario: no se asume efectivo.</summary>
        UnresolvedAccount
    }

    /// <summary>
    /// Partida del plan de un mes ya resuelta para el cálculo de desviación. <c>LinkedTransactionIsCredit</c>
    /// marca el financiamiento con crédito (compra financiada): no es efectivo y no debe tratarse como
    /// plan de efectivo incumplido. <c>IsCashPlanEligible</c> aplica a partidas pendientes: una partida
    /// asignada a crédito o con cuenta no resoluble no es plan de efectivo.
    /// </summary>
    public sealed record DashboardDeviationItem(
        bool IsIncome,
        bool IsExecuted,
        bool LinkedTransactionIsCredit,
        decimal PlannedAmount,
        decimal ActualAmount,
        bool IsCashPlanEligible = true);

    /// <summary>Movimiento de efectivo (ingreso/gasto en cuenta no crédito) ya resuelto para desviación.</summary>
    public sealed record DashboardDeviationCashTransaction(bool IsIncome, decimal Amount, bool IsLinkedToPlan);

    /// <summary>Mes candidato de la ventana de desviación: partidas del plan y movimientos de efectivo.</summary>
    public sealed record DashboardDeviationMonth(
        string Month,
        IReadOnlyList<DashboardDeviationItem> Items,
        IReadOnlyList<DashboardDeviationCashTransaction> CashTransactions);

    /// <summary>
    /// Cálculo puro de la proyección mensual del dashboard. Sin EF ni reloj: recibe todo resuelto
    /// para poder probarse de forma determinista. Conserva la semántica previa de
    /// <c>ProjectedNet</c>/<c>ProjectedCashBalance</c> cuando no hay plan del mes.
    /// </summary>
    public static class DashboardProjectionCalculator
    {
        public const string BasisBudget = "budget";
        public const string BasisTrend = "trend";
        public const string BasisNone = "none";

        private const int MinTrendSampleMonths = 3;

        /// <summary>
        /// Regresión lineal ordinaria de net mensual sobre el índice temporal de los buckets.
        /// </summary>
        public static DashboardProjectionTrend CalculateTrend(IReadOnlyList<DashboardHistoricalMonth> historicalMonths)
        {
            var sampleMonths = historicalMonths.Count(m => m.Income != 0 || m.Expense != 0);
            if (sampleMonths < MinTrendSampleMonths)
            {
                return new DashboardProjectionTrend
                {
                    SampleMonths = sampleMonths,
                    MonthlyNetSlope = 0m,
                    ProjectedMonthlyNet = 0m,
                    HasSufficientHistory = false
                };
            }

            var count = historicalMonths.Count;
            decimal sumX = 0m, sumY = 0m, sumXY = 0m, sumXX = 0m;
            for (var index = 0; index < count; index++)
            {
                decimal x = index;
                var y = historicalMonths[index].Net;
                sumX += x;
                sumY += y;
                sumXY += x * y;
                sumXX += x * x;
            }

            var denominator = count * sumXX - sumX * sumX;
            var slope = denominator == 0m ? 0m : (count * sumXY - sumX * sumY) / denominator;
            var intercept = (sumY - slope * sumX) / count;
            var projectedMonthlyNet = intercept + slope * count;

            return new DashboardProjectionTrend
            {
                SampleMonths = sampleMonths,
                MonthlyNetSlope = RoundMoney(slope),
                ProjectedMonthlyNet = RoundMoney(projectedMonthlyNet),
                HasSufficientHistory = true
            };
        }

        public static DashboardProjectionCalculation Calculate(
            IReadOnlyList<DashboardHistoricalMonth> historicalMonths,
            IReadOnlyDictionary<string, DashboardBudgetMonthBasis> budgetByMonth,
            IReadOnlyDictionary<string, decimal> msiCommitmentByMonth,
            IReadOnlyDictionary<string, DashboardInvestmentMonthEstimate> investmentByMonth,
            int horizonMonths,
            int startYear,
            int startMonth,
            decimal cashRealBalance)
            => Calculate(
                historicalMonths,
                budgetByMonth,
                msiCommitmentByMonth,
                investmentByMonth,
                horizonMonths,
                startYear,
                startMonth,
                cashRealBalance,
                EmptyAmounts,
                historicalMonths,
                new DashboardProjectionDeviation());

        /// <summary>
        /// Cálculo extendido con obligaciones de crédito normal, línea base histórica de efectivo
        /// <b>sin</b> traspasos de liquidación de crédito y el ajuste por desviación ya resuelto. La
        /// semántica de <c>ProjectedNet</c>/<c>ProjectedCashBalance</c> se conserva intacta con el
        /// histórico original; el neto económico base sólo usa la línea base limpia.
        /// </summary>
        public static DashboardProjectionCalculation Calculate(
            IReadOnlyList<DashboardHistoricalMonth> historicalMonths,
            IReadOnlyDictionary<string, DashboardBudgetMonthBasis> budgetByMonth,
            IReadOnlyDictionary<string, decimal> msiCommitmentByMonth,
            IReadOnlyDictionary<string, DashboardInvestmentMonthEstimate> investmentByMonth,
            int horizonMonths,
            int startYear,
            int startMonth,
            decimal cashRealBalance,
            IReadOnlyDictionary<string, decimal> normalCreditPaymentByMonth,
            IReadOnlyList<DashboardHistoricalMonth> cleanHistoricalMonths,
            DashboardProjectionDeviation deviation)
        {
            var trend = CalculateTrend(historicalMonths);
            // Línea base sin traspasos de liquidación de crédito: es la única sobre la que se pueden
            // restar MSI y crédito normal sin doble descuento. Con el mismo historial se reutiliza.
            var cleanTrend = ReferenceEquals(cleanHistoricalMonths, historicalMonths)
                ? trend
                : CalculateTrend(cleanHistoricalMonths);
            var deviationAdjustment = deviation?.MonthlyAdjustment ?? 0m;
            var months = new List<DashboardProjectionMonth>(horizonMonths);
            var runningBalance = cashRealBalance;
            var cumulativeMsiCommitment = 0m;

            for (var offset = 1; offset <= horizonMonths; offset++)
            {
                var bucket = new DateTime(startYear, startMonth, 1).AddMonths(offset);
                var monthKey = FormatMonthKey(bucket.Year, bucket.Month);

                // El plan pendiente del mes reemplaza la tendencia por completo; con al menos una
                // partida (aunque su monto sea cero) el mes es "budget". Sin plan se conserva la
                // semántica histórica de ProjectedNet/ProjectedCashBalance.
                decimal projectedNet;
                string basis;
                var budgetIncome = 0m;
                var budgetExpense = 0m;
                var hasBudget = budgetByMonth.TryGetValue(monthKey, out var budget);
                if (hasBudget)
                {
                    budgetIncome = RoundMoney(budget!.Income);
                    budgetExpense = RoundMoney(budget.Expense);
                    projectedNet = RoundMoney(budget.Income - budget.Expense);
                    basis = BasisBudget;
                }
                else if (trend.HasSufficientHistory)
                {
                    projectedNet = trend.ProjectedMonthlyNet;
                    basis = BasisTrend;
                }
                else
                {
                    projectedNet = 0m;
                    basis = BasisNone;
                }

                runningBalance += projectedNet;

                var msiCommitment = msiCommitmentByMonth.TryGetValue(monthKey, out var msi) ? RoundMoney(msi) : 0m;
                cumulativeMsiCommitment += msiCommitment;

                var investment = investmentByMonth.TryGetValue(monthKey, out var estimate)
                    ? estimate
                    : new DashboardInvestmentMonthEstimate(monthKey, 0m, null);
                var investmentEstimate = RoundMoney(investment.Estimate);

                var normalCreditPayment = normalCreditPaymentByMonth.TryGetValue(monthKey, out var normalCredit)
                    ? RoundMoney(normalCredit)
                    : 0m;

                // Base del neto económico: el plan del mes reemplaza la línea base; sin plan se usa
                // la tendencia limpia y, si no alcanza la muestra, cero (nunca el histórico sucio).
                string baseEconomicBasis;
                decimal baseBasisNet;
                if (hasBudget)
                {
                    baseEconomicBasis = BasisBudget;
                    baseBasisNet = projectedNet;
                }
                else if (cleanTrend.HasSufficientHistory)
                {
                    baseEconomicBasis = BasisTrend;
                    baseBasisNet = cleanTrend.ProjectedMonthlyNet;
                }
                else
                {
                    baseEconomicBasis = BasisNone;
                    baseBasisNet = 0m;
                }

                var baseEconomicNet = RoundMoney(baseBasisNet + investmentEstimate - msiCommitment - normalCreditPayment);

                months.Add(new DashboardProjectionMonth
                {
                    Month = monthKey,
                    ProjectedCashBalance = RoundMoney(runningBalance),
                    ProjectedNet = projectedNet,
                    MsiCommitment = msiCommitment,
                    MsiPaymentScenarioBalance = RoundMoney(runningBalance - cumulativeMsiCommitment),
                    BudgetBasis = basis,
                    BudgetIncome = budgetIncome,
                    BudgetExpense = budgetExpense,
                    InvestmentEstimate = investmentEstimate,
                    InvestmentSourcePlanMonth = investment.SourcePlanMonth,
                    // La MSI ya está separada del gasto presupuestado: aquí se resta exactamente una vez.
                    // La estimación de inversión entra al neto económico, nunca al efectivo.
                    EstimatedEconomicNet = RoundMoney(projectedNet - msiCommitment + investmentEstimate),
                    NormalCreditPayment = normalCreditPayment,
                    BaseEconomicBasis = baseEconomicBasis,
                    BaseEconomicNet = baseEconomicNet,
                    DeviationAdjustment = deviationAdjustment,
                    AdjustedEconomicNet = RoundMoney(baseEconomicNet + deviationAdjustment)
                });
            }

            return new DashboardProjectionCalculation { Trend = trend, Months = months };
        }

        /// <summary>
        /// Clasifica una partida pendiente frente al efectivo usando la cuenta asignada ya resuelta
        /// en el alcance del usuario. Sin asignar = efectivo (convención); cuenta no resoluble = no se
        /// asume efectivo.
        /// </summary>
        public static DashboardPendingPlanCash ClassifyPendingPlanCash(int? assignedAccountId, bool? assignedAccountIsCredit)
        {
            if (assignedAccountId is null)
            {
                return DashboardPendingPlanCash.Cash;
            }

            return assignedAccountIsCredit switch
            {
                true => DashboardPendingPlanCash.FinancedCredit,
                false => DashboardPendingPlanCash.Cash,
                null => DashboardPendingPlanCash.UnresolvedAccount
            };
        }

        /// <summary>True sólo cuando la partida pendiente es un flujo de efectivo del plan.</summary>
        public static bool IsCashEligiblePendingPlan(int? assignedAccountId, bool? assignedAccountIsCredit)
            => ClassifyPendingPlanCash(assignedAccountId, assignedAccountIsCredit) == DashboardPendingPlanCash.Cash;

        /// <summary>
        /// Promedio de la desviación mensual de los meses con plan comparable. Un mes sin plan de
        /// efectivo comparable no observa nada (no convierte sus movimientos en desviación). Sin cubrir
        /// las 3 observaciones el ajuste es cero y se declara insuficiente.
        /// </summary>
        public static DashboardProjectionDeviation CalculateDeviation(
            IReadOnlyList<DashboardDeviationMonth> months,
            int requiredSampleSize)
        {
            // Comparable = mes con alguna partida ejecutada o con plan pendiente de efectivo. Una
            // partida pendiente asignada a crédito (o con cuenta no resoluble) no es plan de efectivo:
            // no califica el mes ni aporta desviación.
            static bool IsComparable(DashboardDeviationItem item) => item.IsExecuted || item.IsCashPlanEligible;

            var sampled = months.Where(m => m.Items.Any(IsComparable)).ToList();
            var sufficient = requiredSampleSize > 0 && sampled.Count >= requiredSampleSize;

            decimal incomeSum = 0m, expenseSum = 0m, unplannedSum = 0m;
            foreach (var month in sampled)
            {
                foreach (var item in month.Items)
                {
                    if (item.IsExecuted)
                    {
                        // Compra financiada con crédito: no es efectivo y no es plan de efectivo
                        // incumplido, así que no aporta desviación de caja.
                        if (item.LinkedTransactionIsCredit)
                        {
                            continue;
                        }

                        if (item.IsIncome)
                        {
                            incomeSum += item.ActualAmount - item.PlannedAmount;
                        }
                        else
                        {
                            expenseSum += item.PlannedAmount - item.ActualAmount;
                        }
                    }
                    else if (item.IsCashPlanEligible)
                    {
                        if (item.IsIncome)
                        {
                            // Plan de ingreso sin ejecutar: se dejó de recibir.
                            incomeSum -= item.PlannedAmount;
                        }
                        else
                        {
                            expenseSum += item.PlannedAmount;
                        }
                    }
                }

                foreach (var cashTransaction in month.CashTransactions)
                {
                    // Lo ya enlazado a una partida se cuenta en su comparación plan/real, no aquí.
                    if (cashTransaction.IsLinkedToPlan)
                    {
                        continue;
                    }

                    unplannedSum += cashTransaction.IsIncome ? cashTransaction.Amount : -cashTransaction.Amount;
                }
            }

            return new DashboardProjectionDeviation
            {
                WindowMonths = months.Select(m => m.Month).ToList(),
                SampledMonths = sampled.Select(m => m.Month).ToList(),
                SampleSize = sampled.Count,
                RequiredSampleSize = requiredSampleSize,
                HasSufficientSample = sufficient,
                IncomeDeviation = sufficient ? RoundMoney(incomeSum / sampled.Count) : 0m,
                ExpenseDeviation = sufficient ? RoundMoney(expenseSum / sampled.Count) : 0m,
                UnplannedDeviation = sufficient ? RoundMoney(unplannedSum / sampled.Count) : 0m,
                MonthlyAdjustment = sufficient
                    ? RoundMoney((incomeSum + expenseSum + unplannedSum) / sampled.Count)
                    : 0m
            };
        }

        private static readonly IReadOnlyDictionary<string, decimal> EmptyAmounts =
            new Dictionary<string, decimal>(StringComparer.Ordinal);

        /// <summary>
        /// Regla de selección del plan de inversión (determinista y mes a mes): para cada mes
        /// solicitado se usa el plan persistido más reciente cuyo <c>PlanMonth</c> no sea posterior al
        /// mes y cuya proyección guardada cubra ese mes; el interés es la fila de ese mismo mes, ya
        /// compuesta por <see cref="InvestmentCalculator.Project"/>. Si ningún plan guardado cubre el
        /// mes, el estimado es 0: nunca se fabrica un borrador ni se extrapola una tasa.
        /// </summary>
        public static IReadOnlyDictionary<string, DashboardInvestmentMonthEstimate> BuildInvestmentEstimates(
            IReadOnlyList<DashboardInvestmentPlanSnapshot> plans,
            IReadOnlyList<string> monthKeys)
        {
            var planSeries = new List<(string PlanMonth, Dictionary<string, decimal> InterestByMonth)>();
            foreach (var plan in plans)
            {
                var planMonth = plan.PlanMonth?.Trim() ?? string.Empty;
                if (planMonth.Length == 0 || plan.ProjectionMonths < 1 || plan.Allocations.Count == 0)
                {
                    continue;
                }

                var series = new Dictionary<string, decimal>(StringComparer.Ordinal);
                foreach (var allocation in plan.Allocations)
                {
                    if (allocation.Tiers.Count == 0)
                    {
                        continue;
                    }

                    List<InvestmentProjectionRow> rows;
                    try
                    {
                        rows = InvestmentCalculator.Project(planMonth, allocation.AllocatedAmount, allocation.Tiers, plan.ProjectionMonths);
                    }
                    catch (ArgumentException)
                    {
                        continue; // escalera marginal inválida: no se inventa una tasa
                    }
                    catch (FormatException)
                    {
                        continue; // plan_month ilegible: se ignora, no se corrige
                    }

                    foreach (var row in rows)
                    {
                        series[row.Month] = series.GetValueOrDefault(row.Month) + row.Interest;
                    }
                }

                if (series.Count > 0)
                {
                    planSeries.Add((planMonth, series));
                }
            }

            var result = new Dictionary<string, DashboardInvestmentMonthEstimate>(StringComparer.Ordinal);
            foreach (var monthKey in monthKeys)
            {
                (string PlanMonth, decimal Estimate)? applicable = null;
                foreach (var (planMonth, series) in planSeries)
                {
                    if (string.CompareOrdinal(planMonth, monthKey) > 0 || !series.TryGetValue(monthKey, out var interest))
                    {
                        continue;
                    }

                    if (applicable is null || string.CompareOrdinal(planMonth, applicable.Value.PlanMonth) > 0)
                    {
                        applicable = (planMonth, interest);
                    }
                }

                result[monthKey] = applicable is null
                    ? new DashboardInvestmentMonthEstimate(monthKey, 0m, null)
                    : new DashboardInvestmentMonthEstimate(monthKey, RoundMoney(applicable.Value.Estimate), applicable.Value.PlanMonth);
            }

            return result;
        }

        private static string FormatMonthKey(int year, int month) => $"{year:D4}-{month:D2}";

        private static decimal RoundMoney(decimal value)
            => Math.Round(value, 2, MidpointRounding.AwayFromZero);
    }
}
