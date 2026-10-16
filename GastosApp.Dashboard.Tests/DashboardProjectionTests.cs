using GastosApp.BusinessLogic.Models.Dashboard;
using GastosApp.BusinessLogic.Services;
using GastosApp.BusinessLogic.Services.Investments;

namespace GastosApp.Dashboard.Tests;

/// <summary>
/// Deterministic regression coverage for the pure dashboard projection calculator. No EF, no clock,
/// no database: every input is explicit so the month/budget/MSI/investment algebra is the only
/// variable. These are the T1 acceptance rules; the frontend contract is exercised later in T2.
/// </summary>
public static class DashboardProjectionTests
{
    public static Task RunAsync()
    {
        var checks = 0;
        void Check(bool condition, string name)
        {
            if (!condition) throw new Exception($"FAIL {name}");
            checks++;
        }

        static bool Close(decimal a, decimal b) => Math.Abs(a - b) < 0.005m;

        var trendHistory = History(("2025-08", 100m), ("2025-09", 100m), ("2025-10", 100m), ("2025-11", 100m), ("2025-12", 100m), ("2026-01", 100m));
        var thinHistory = History(("2025-12", 100m), ("2026-01", 100m));
        var noBudget = new Dictionary<string, DashboardBudgetMonthBasis>();
        var noMsi = new Dictionary<string, decimal>();
        var noInvestment = new Dictionary<string, DashboardInvestmentMonthEstimate>();

        // Rule: pending budget income - expense replaces the trend wholly for months with >= 1 pending item.
        var budget = new Dictionary<string, DashboardBudgetMonthBasis>
        {
            ["2026-02"] = new("2026-02", 500m, 100m, 2)
        };
        var withBudget = DashboardProjectionCalculator.Calculate(trendHistory, budget, noMsi, noInvestment, 3, 2026, 1, 1000m);
        Check(Close(withBudget.Trend.ProjectedMonthlyNet, 100m), "Trend is the 100/mo baseline for the fallback months");
        Check(withBudget.Months[0].BudgetBasis == DashboardProjectionCalculator.BasisBudget, "Budget month is flagged as budget basis");
        Check(Close(withBudget.Months[0].ProjectedNet, 400m) && Close(withBudget.Months[0].BudgetIncome, 500m) && Close(withBudget.Months[0].BudgetExpense, 100m),
            "Pending budget income - expense replaces the trend for the plan month");
        Check(Close(withBudget.Months[0].ProjectedCashBalance, 1400m), "Cash balance advances by the budget net, not the trend net");
        Check(withBudget.Months[1].BudgetBasis == DashboardProjectionCalculator.BasisTrend && Close(withBudget.Months[1].ProjectedNet, 100m),
            "Month without a plan falls back to the historical trend");
        Check(Close(withBudget.Months[1].ProjectedCashBalance, 1500m) && Close(withBudget.Months[2].ProjectedCashBalance, 1600m),
            "Fallback months keep the legacy trend accumulation");

        // Rule: a plan with zero amounts still counts, so it must not fall back to the trend.
        var zeroBudget = new Dictionary<string, DashboardBudgetMonthBasis>
        {
            ["2026-02"] = new("2026-02", 0m, 0m, 1)
        };
        var withZeroBudget = DashboardProjectionCalculator.Calculate(trendHistory, zeroBudget, noMsi, noInvestment, 1, 2026, 1, 1000m);
        Check(withZeroBudget.Months[0].BudgetBasis == DashboardProjectionCalculator.BasisBudget && Close(withZeroBudget.Months[0].ProjectedNet, 0m) &&
              withZeroBudget.Months[0].BudgetIncome == 0m && withZeroBudget.Months[0].BudgetExpense == 0m,
            "A zero-amount pending plan still replaces the trend");
        Check(Close(withZeroBudget.Months[0].ProjectedCashBalance, 1000m), "Zero plan does not advance the cash balance");

        // Rule: no plan and no sufficient history => no fabricated net.
        var withoutHistory = DashboardProjectionCalculator.Calculate(thinHistory, noBudget, noMsi, noInvestment, 2, 2026, 1, 1000m);
        Check(!withoutHistory.Trend.HasSufficientHistory && withoutHistory.Months.All(m => m.BudgetBasis == DashboardProjectionCalculator.BasisNone && m.ProjectedNet == 0m),
            "Without plan or history the projected net is explicitly none/zero");
        Check(Close(withoutHistory.Months[0].ProjectedCashBalance, 1000m) && Close(withoutHistory.Months[1].ProjectedCashBalance, 1000m),
            "No history leaves the cash balance untouched");

        // Rule: investment estimates are separate from liquid cash and feed only the economic net.
        var investment = new Dictionary<string, DashboardInvestmentMonthEstimate>
        {
            ["2026-02"] = new("2026-02", 25m, "2026-01")
        };
        var withInvestment = DashboardProjectionCalculator.Calculate(trendHistory, noBudget, noMsi, investment, 2, 2026, 1, 1000m);
        Check(Close(withInvestment.Months[0].InvestmentEstimate, 25m) && withInvestment.Months[0].InvestmentSourcePlanMonth == "2026-01",
            "Investment estimate and its source plan are surfaced for the covered month");
        Check(Close(withInvestment.Months[0].ProjectedCashBalance, 1100m), "Investment estimate is never added to the cash balance");
        Check(Close(withInvestment.Months[0].EstimatedEconomicNet, 125m), "Economic net includes the estimate without touching cash");
        Check(withInvestment.Months[1].InvestmentSourcePlanMonth is null && withInvestment.Months[1].InvestmentEstimate == 0m,
            "Uncovered month reports no investment estimate");

        // Rule: MSI is deducted exactly once from the displayed final net, never from the cash series.
        var msi = new Dictionary<string, decimal> { ["2026-02"] = 30m };
        var withMsi = DashboardProjectionCalculator.Calculate(trendHistory, noBudget, msi, investment, 3, 2026, 1, 1000m);
        Check(Close(withMsi.Months[0].ProjectedCashBalance, 1100m) && Close(withMsi.Months[0].MsiCommitment, 30m),
            "MSI commitment stays out of the cash balance");
        Check(Close(withMsi.Months[0].EstimatedEconomicNet, 95m), "Final economic net deducts MSI exactly once (100 - 30 + 25)");
        Check(Close(withMsi.Months[0].MsiPaymentScenarioBalance, 1070m), "MSI payment scenario keeps its cumulative legacy meaning");
        Check(Close(withMsi.Months[1].MsiPaymentScenarioBalance, 1170m), "Cumulative MSI is not double counted across months");

        // Rule: normal (Revolving) credit is subtracted exactly once from the base economic net,
        // while the legacy cash series and legacy economic net stay untouched.
        var normalCredit = new Dictionary<string, decimal> { ["2026-02"] = 70m };
        var deviation = new DashboardProjectionDeviation { MonthlyAdjustment = 15m, HasSufficientSample = true, RequiredSampleSize = 3, SampleSize = 3 };
        var cleanHistory = History(("2025-08", 100m), ("2025-09", 100m), ("2025-10", 100m), ("2025-11", 100m), ("2025-12", 100m), ("2026-01", 100m));
        var budgetCredit = new Dictionary<string, DashboardBudgetMonthBasis> { ["2026-02"] = new("2026-02", 1000m, 200m, 2) };
        var withNormalCredit = DashboardProjectionCalculator.Calculate(
            trendHistory, budgetCredit, msi, investment, 1, 2026, 1, 1000m, normalCredit, cleanHistory, deviation);
        Check(Close(withNormalCredit.Months[0].NormalCreditPayment, 70m), "Normal Revolving payment is surfaced for its due month");
        Check(withNormalCredit.Months[0].BaseEconomicBasis == DashboardProjectionCalculator.BasisBudget, "Base economic net of a plan month is budget-based");
        Check(Close(withNormalCredit.Months[0].BaseEconomicNet, 725m), "Base economic net = budget 800 + investment 25 - MSI 30 - normal credit 70");
        Check(Close(withNormalCredit.Months[0].AdjustedEconomicNet, 740m), "Adjusted net = base + deviation adjustment (725 + 15)");
        Check(Close(withNormalCredit.Months[0].DeviationAdjustment, 15m), "Deviation adjustment is disclosed per month");
        Check(Close(withNormalCredit.Months[0].EstimatedEconomicNet, 795m), "Legacy economic net keeps its pre-normal-credit definition (800 - 30 + 25)");
        Check(Close(withNormalCredit.Months[0].ProjectedNet, 800m) && Close(withNormalCredit.Months[0].ProjectedCashBalance, 1800m),
            "Legacy cash series is untouched by normal credit and investment");

        // Rule: in the historical fallback the base uses the cash baseline WITHOUT credit settlement
        // transfers, so subtracting MSI + normal credit is not a double subtraction. The legacy trend
        // keeps the original (settlement-inclusive) history untouched.
        var dirtyHistory = History(("2025-08", 100m), ("2025-09", 100m), ("2025-10", 100m), ("2025-11", 100m), ("2025-12", 100m), ("2026-01", 100m));
        var settlementFreeHistory = History(("2025-08", 160m), ("2025-09", 160m), ("2025-10", 160m), ("2025-11", 160m), ("2025-12", 160m), ("2026-01", 160m));
        var fallback = DashboardProjectionCalculator.Calculate(
            dirtyHistory, noBudget, msi, investment, 1, 2026, 1, 1000m, normalCredit, settlementFreeHistory, new DashboardProjectionDeviation());
        Check(Close(fallback.Months[0].ProjectedNet, 100m) && Close(fallback.Months[0].ProjectedCashBalance, 1100m),
            "Fallback legacy net still uses the original settlement-inclusive trend (100)");
        Check(Close(fallback.Months[0].EstimatedEconomicNet, 95m), "Legacy economic net keeps its definition (100 - 30 + 25)");
        Check(fallback.Months[0].BaseEconomicBasis == DashboardProjectionCalculator.BasisTrend, "Clean baseline with enough history is a trend base");
        Check(Close(fallback.Months[0].BaseEconomicNet, 85m), "Clean fallback base = 160 + 25 - 30 - 70, obligations subtracted once");

        // Rule: the clean baseline drives its own sufficiency; a thin clean sample reports none
        // instead of borrowing the dirtier legacy trend.
        var thinCleanHistory = History(("2025-12", 100m), ("2026-01", 100m));
        var thinClean = DashboardProjectionCalculator.Calculate(
            dirtyHistory, noBudget, msi, investment, 1, 2026, 1, 1000m, normalCredit, thinCleanHistory, new DashboardProjectionDeviation());
        Check(thinClean.Months[0].BaseEconomicBasis == DashboardProjectionCalculator.BasisNone && Close(thinClean.Months[0].BaseEconomicNet, -75m),
            "Base falls to none/zero when the clean baseline lacks sample (0 + 25 - 30 - 70)");

        // Rule: monthly deviation = actual vs plan for linked executed items, pending plan as
        // unexecuted commitment, and unplanned cash. Linked cash is never double counted as unplanned.
        var fullWindow = new List<DashboardDeviationMonth>
        {
            new("2025-11",
                [
                    new DashboardDeviationItem(IsIncome: true, IsExecuted: true, LinkedTransactionIsCredit: false, PlannedAmount: 1000m, ActualAmount: 1201m),
                    new DashboardDeviationItem(IsIncome: false, IsExecuted: true, LinkedTransactionIsCredit: false, PlannedAmount: 500m, ActualAmount: 398m),
                    new DashboardDeviationItem(IsIncome: false, IsExecuted: true, LinkedTransactionIsCredit: true, PlannedAmount: 300m, ActualAmount: 300m)
                ],
                [
                    new DashboardDeviationCashTransaction(IsIncome: true, Amount: 1201m, IsLinkedToPlan: true),
                    new DashboardDeviationCashTransaction(IsIncome: true, Amount: 50m, IsLinkedToPlan: false),
                    new DashboardDeviationCashTransaction(IsIncome: false, Amount: 398m, IsLinkedToPlan: true),
                    new DashboardDeviationCashTransaction(IsIncome: false, Amount: 20m, IsLinkedToPlan: false)
                ]),
            new("2025-12",
                [
                    new DashboardDeviationItem(IsIncome: true, IsExecuted: false, LinkedTransactionIsCredit: false, PlannedAmount: 801m, ActualAmount: 0m),
                    new DashboardDeviationItem(IsIncome: false, IsExecuted: false, LinkedTransactionIsCredit: false, PlannedAmount: 300m, ActualAmount: 0m)
                ],
                []),
            new("2026-01",
                [
                    new DashboardDeviationItem(IsIncome: false, IsExecuted: true, LinkedTransactionIsCredit: false, PlannedAmount: 200m, ActualAmount: 251m)
                ],
                [new DashboardDeviationCashTransaction(IsIncome: false, Amount: 102m, IsLinkedToPlan: false)])
        };
        var full = DashboardProjectionCalculator.CalculateDeviation(fullWindow, 3);
        Check(full.HasSufficientSample && full.SampleSize == 3 && full.RequiredSampleSize == 3, "Three comparable months make the adjustment sufficient");
        Check(full.SampledMonths.Count == 3 && full.WindowMonths.Count == 3, "Window and sampled months are disclosed separately");
        Check(Close(full.IncomeDeviation, -200m), "Income deviation averages 201, -801 and 0 to -200");
        Check(Close(full.ExpenseDeviation, 117m), "Expense deviation averages 102, 300 and -51 to 117 (positive = underspent)");
        Check(Close(full.UnplannedDeviation, -24m), "Unplanned deviation averages 30, 0 and -102 to -24");
        Check(Close(full.MonthlyAdjustment, -107m), "Monthly adjustment is the mean of 333, -501 and -153");

        // Rule: pending-only and executed-credit months are comparable observations; a credit item
        // is not treated as an unfulfilled cash plan.
        var creditOnlyWindow = new List<DashboardDeviationMonth>
        {
            new("2025-11", [new DashboardDeviationItem(false, true, true, 500m, 500m)], []),
            new("2025-12", [new DashboardDeviationItem(false, true, true, 200m, 200m)], []),
            new("2026-01", [new DashboardDeviationItem(false, false, false, 300m, 0m)], [])
        };
        var creditOnly = DashboardProjectionCalculator.CalculateDeviation(creditOnlyWindow, 3);
        Check(creditOnly.HasSufficientSample && creditOnly.SampleSize == 3, "Executed credit-only months still count as observations");
        Check(Close(creditOnly.ExpenseDeviation, 100m) && Close(creditOnly.MonthlyAdjustment, 100m),
            "Executed credit purchases contribute 0; only the pending 300 counts, averaged to 100");

        // Rule: without all three comparable months the adjustment is zero but the sample is disclosed.
        var thinWindow = new List<DashboardDeviationMonth>
        {
            new("2025-11", [new DashboardDeviationItem(true, true, false, 100m, 200m)], []),
            new("2025-12", [], [new DashboardDeviationCashTransaction(true, 999m, false)]),
            new("2026-01", [new DashboardDeviationItem(true, true, false, 100m, 100m)], [])
        };
        var thin = DashboardProjectionCalculator.CalculateDeviation(thinWindow, 3);
        Check(!thin.HasSufficientSample && thin.SampleSize == 2, "Two comparable months are not enough");
        Check(thin.MonthlyAdjustment == 0m && thin.IncomeDeviation == 0m && thin.ExpenseDeviation == 0m && thin.UnplannedDeviation == 0m,
            "Insufficient sample forces a disclosed zero adjustment");
        Check(Close(thin.MonthlyAdjustment, 0m) && thin.SampledMonths.Count == 2, "Sample is disclosed even when the adjustment is zero");

        // Rule: a comparable month with zero deviation still counts toward sufficiency.
        var zeroWindow = new List<DashboardDeviationMonth>
        {
            new("2025-11", [new DashboardDeviationItem(true, true, false, 100m, 100m)], []),
            new("2025-12", [new DashboardDeviationItem(false, true, false, 50m, 50m)], []),
            new("2026-01", [new DashboardDeviationItem(true, true, false, 10m, 10m)], [])
        };
        var zeroDev = DashboardProjectionCalculator.CalculateDeviation(zeroWindow, 3);
        Check(zeroDev.HasSufficientSample && zeroDev.SampleSize == 3 && zeroDev.MonthlyAdjustment == 0m,
            "Zero-deviation comparable months count toward the 3-observation requirement");

        // Rule: a pending plan item's assigned account decides whether it is cash. Unassigned stays
        // cash by convention; a resolvable cash account is cash; a credit account is financed; an
        // unresolvable (foreign) id is never silently treated as cash.
        Check(DashboardProjectionCalculator.ClassifyPendingPlanCash(null, null) == DashboardPendingPlanCash.Cash,
            "Unassigned pending plan stays cash by convention");
        Check(DashboardProjectionCalculator.ClassifyPendingPlanCash(7, false) == DashboardPendingPlanCash.Cash,
            "Pending plan on a cash account is cash");
        Check(DashboardProjectionCalculator.ClassifyPendingPlanCash(7, true) == DashboardPendingPlanCash.FinancedCredit,
            "Pending plan on a credit account is a financed purchase");
        Check(DashboardProjectionCalculator.ClassifyPendingPlanCash(7, null) == DashboardPendingPlanCash.UnresolvedAccount,
            "Pending plan with a foreign/unresolved account is not cash");
        Check(DashboardProjectionCalculator.IsCashEligiblePendingPlan(null, null) &&
              DashboardProjectionCalculator.IsCashEligiblePendingPlan(7, false) &&
              !DashboardProjectionCalculator.IsCashEligiblePendingPlan(7, true) &&
              !DashboardProjectionCalculator.IsCashEligiblePendingPlan(7, null),
            "Only cash-classified pending plans are cash eligible");

        // Rule: a pending plan assigned to credit must not qualify its month (no false zero budget /
        // no false cash-plan observation).
        var creditPlanWindow = new List<DashboardDeviationMonth>
        {
            new("2025-11", [new DashboardDeviationItem(true, true, false, 100m, 200m)], []),
            new("2025-12", [new DashboardDeviationItem(false, false, false, 500m, 0m, IsCashPlanEligible: false)], []),
            new("2026-01", [new DashboardDeviationItem(true, true, false, 100m, 100m)], [])
        };
        var creditPlan = DashboardProjectionCalculator.CalculateDeviation(creditPlanWindow, 3);
        Check(!creditPlan.HasSufficientSample && creditPlan.SampleSize == 2,
            "A credit-assigned pending month is not a comparable observation");
        Check(creditPlan.ExpenseDeviation == 0m && creditPlan.MonthlyAdjustment == 0m,
            "A credit-assigned pending plan does not manufacture cash savings or a zero budget month");

        // Rule: when a month also has a real cash plan, the credit-assigned item is excluded from the
        // comparison instead of counting its planned amount as unspent cash.
        var mixedCreditWindow = new List<DashboardDeviationMonth>
        {
            new("2025-11", [new DashboardDeviationItem(true, true, false, 100m, 100m)], []),
            new("2025-12", [new DashboardDeviationItem(true, true, false, 100m, 100m)], []),
            new("2026-01",
                [
                    new DashboardDeviationItem(true, true, false, 100m, 100m),
                    new DashboardDeviationItem(false, false, false, 500m, 0m, IsCashPlanEligible: false)
                ],
                [])
        };
        var mixedCredit = DashboardProjectionCalculator.CalculateDeviation(mixedCreditWindow, 3);
        Check(mixedCredit.HasSufficientSample && mixedCredit.SampleSize == 3,
            "A month with an explicit cash plan still counts even alongside a credit item");
        Check(mixedCredit.ExpenseDeviation == 0m && mixedCredit.MonthlyAdjustment == 0m,
            "The credit-assigned item is excluded from comparison, not counted as cash savings");

        // Rule: persisted-plan selection is month aligned and uses the latest applicable coverage.
        var plans = new List<DashboardInvestmentPlanSnapshot>
        {
            Plan("2026-01", 3, 100000m),
            Plan("2026-02", 3, 200000m)
        };
        var monthKeys = new List<string> { "2026-01", "2026-02", "2026-03", "2026-04", "2026-05" };
        var estimates = DashboardProjectionCalculator.BuildInvestmentEstimates(plans, monthKeys);
        Check(Close(estimates["2026-01"].Estimate, 1000m) && estimates["2026-01"].SourcePlanMonth == "2026-01",
            "Only the plan whose coverage starts at the month applies to it");
        Check(Close(estimates["2026-02"].Estimate, 2000m) && estimates["2026-02"].SourcePlanMonth == "2026-02",
            "The latest applicable persisted plan wins the overlap");
        Check(Close(estimates["2026-03"].Estimate, 2020m) && estimates["2026-03"].SourcePlanMonth == "2026-02",
            "Overlap uses the newer plan's own compounded row for that month");
        Check(Close(estimates["2026-04"].Estimate, 2040.2m) && estimates["2026-04"].SourcePlanMonth == "2026-02",
            "A plan keeps covering months after the next plan month is out of range");
        Check(estimates["2026-05"].Estimate == 0m && estimates["2026-05"].SourcePlanMonth is null,
            "No persisted plan coverage reports zero instead of a fabricated draft");
        Check(!estimates.ContainsKey("2026-06"), "Months outside the requested keys are not emitted");

        // Rule: degenerate persisted plans contribute nothing instead of throwing.
        var degenerate = new List<DashboardInvestmentPlanSnapshot>
        {
            Plan("2026-01", 0, 100000m),
            new("2026-02", 3, [])
        };
        var degenerateEstimates = DashboardProjectionCalculator.BuildInvestmentEstimates(degenerate, ["2026-01", "2026-02", "2026-03"]);
        Check(degenerateEstimates.Values.All(e => e.Estimate == 0m && e.SourcePlanMonth is null),
            "Plans without horizon or allocations never fabricate an estimate");

        Console.WriteLine($"PASS {checks} deterministic dashboard projection outcomes");
        return Task.CompletedTask;
    }

    private static List<DashboardHistoricalMonth> History(params (string Month, decimal Net)[] months)
        => months.Select(m => new DashboardHistoricalMonth
        {
            Month = m.Month,
            Income = m.Net > 0 ? m.Net : 0m,
            Expense = m.Net < 0 ? -m.Net : 0m,
            Net = m.Net,
            HasActivity = true
        }).ToList();

    private static DashboardInvestmentPlanSnapshot Plan(string planMonth, int projectionMonths, decimal allocatedAmount)
        => new(planMonth, projectionMonths,
            [new DashboardInvestmentAllocationSnapshot(allocatedAmount, [new MarginalRateTier(0m, null, 12m)])]);
}
