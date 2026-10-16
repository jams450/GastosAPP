import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProjectionChartLayout,
  buildProjectionNetData,
  hasHistoryActivity,
  projectionBaseBasisLabel,
  projectionDeviationBreakdown,
  projectionInvestmentSummary,
  projectionMethodNet,
  projectionNetBreakdown
} from "./projection-chart.ts";
import type { DashboardProjectionDeviation, DashboardProjectionHistoricalMonth, DashboardProjectionMonth } from "@/lib/contracts/dashboard";

function historyMonth(month: string, hasActivity: boolean): DashboardProjectionHistoricalMonth {
  return { month, income: hasActivity ? 100 : 0, expense: 0, net: hasActivity ? 100 : 0, hasActivity };
}

function projectionMonth(month: string, overrides: Partial<DashboardProjectionMonth> = {}): DashboardProjectionMonth {
  return {
    month,
    projectedCashBalance: 1000,
    projectedNet: 0,
    msiCommitment: 0,
    msiPaymentScenarioBalance: null,
    budgetBasis: "none",
    budgetIncome: 0,
    budgetExpense: 0,
    investmentEstimate: 0,
    investmentSourcePlanMonth: null,
    estimatedEconomicNet: 0,
    normalCreditPayment: 0,
    baseEconomicBasis: "none",
    baseEconomicNet: 0,
    deviationAdjustment: 0,
    adjustedEconomicNet: 0,
    ...overrides
  };
}

test("Hoy ocupa un slot propio entre el último histórico y la primera proyección", () => {
  const layout = buildProjectionChartLayout(
    [historyMonth("2026-04", true), historyMonth("2026-05", false), historyMonth("2026-06", true)],
    [projectionMonth("2026-07"), projectionMonth("2026-08")]
  );

  assert.equal(layout.todaySlot, 3);
  assert.equal(layout.projectionStartSlot, 4);
  assert.equal(layout.slotCount, 6);
  assert.ok(layout.todaySlot! > 2);
  assert.equal(layout.projectionStartSlot, layout.todaySlot! + 1);
});

test("sin proyección no se reserva slot para Hoy", () => {
  const layout = buildProjectionChartLayout([historyMonth("2026-05", true), historyMonth("2026-06", false)], []);

  assert.equal(layout.todaySlot, null);
  assert.equal(layout.projectionStartSlot, 2);
  assert.equal(layout.slotCount, 2);
});

test("sin histórico la proyección arranca en el primer slot y no hay Hoy", () => {
  const layout = buildProjectionChartLayout([], [projectionMonth("2026-07")]);

  assert.equal(layout.todaySlot, null);
  assert.equal(layout.projectionStartSlot, 0);
  assert.equal(layout.slotCount, 1);
});

test("hasHistoryActivity distingue meses vacíos de meses con neto cero", () => {
  assert.equal(hasHistoryActivity([historyMonth("2026-05", false), historyMonth("2026-06", false)]), false);
  assert.equal(hasHistoryActivity([historyMonth("2026-05", false), historyMonth("2026-06", true)]), true);
  assert.equal(hasHistoryActivity([]), false);
});

test("projectionNetBreakdown usa el plan del mes cuando el basis es presupuesto", () => {
  const rows = projectionNetBreakdown(
    projectionMonth("2026-07", {
      budgetBasis: "budget",
      baseEconomicBasis: "budget",
      budgetIncome: 1200,
      budgetExpense: 400,
      investmentEstimate: 35,
      msiCommitment: 150,
      normalCreditPayment: 80,
      estimatedEconomicNet: 685,
      baseEconomicNet: 605,
      adjustedEconomicNet: 605
    })
  );

  assert.deepEqual(rows, [
    { key: "budgetIncome", amount: 1200 },
    { key: "budgetExpense", amount: -400 },
    { key: "investmentEstimate", amount: 35 },
    { key: "msiCommitment", amount: -150 },
    { key: "normalCreditPayment", amount: -80 },
    { key: "finalNet", amount: 605 }
  ]);
});

test("projectionNetBreakdown cae al neto histórico fuera del presupuesto", () => {
  const rows = projectionNetBreakdown(
    projectionMonth("2026-08", {
      budgetBasis: "trend",
      baseEconomicBasis: "trend",
      projectedNet: 500,
      investmentEstimate: 20,
      msiCommitment: 120,
      normalCreditPayment: 30,
      estimatedEconomicNet: 400,
      baseEconomicNet: 500,
      adjustedEconomicNet: 500
    })
  );

  assert.deepEqual(rows, [
    // Contribución base histórica derivada para que el desglose sume el neto base.
    { key: "historicalNet", amount: 630 },
    { key: "investmentEstimate", amount: 20 },
    { key: "msiCommitment", amount: -120 },
    { key: "normalCreditPayment", amount: -30 },
    { key: "finalNet", amount: 500 }
  ]);
});

test("projectionNetBreakdown suma exactamente el neto final (MSI una sola vez)", () => {
  const month = projectionMonth("2026-07", {
    budgetBasis: "budget",
    baseEconomicBasis: "budget",
    budgetIncome: 1000,
    budgetExpense: 250.5,
    investmentEstimate: 12.75,
    msiCommitment: 300,
    normalCreditPayment: 40,
    estimatedEconomicNet: 462.25,
    baseEconomicNet: 422.25,
    adjustedEconomicNet: 422.25
  });
  const parts = projectionNetBreakdown(month).filter((row) => row.key !== "finalNet");
  const sum = parts.reduce((total, row) => total + row.amount, 0);

  assert.equal(sum, month.baseEconomicNet);
});

test("buildProjectionNetData usa el neto final estimado en la proyección y respeta el histórico vacío", () => {
  const data = buildProjectionNetData(
    [historyMonth("2026-05", true), historyMonth("2026-06", false)],
    [
      projectionMonth("2026-07", {
        budgetBasis: "budget",
        baseEconomicBasis: "budget",
        budgetIncome: 900,
        budgetExpense: 100,
        estimatedEconomicNet: 800,
        baseEconomicNet: 800,
        adjustedEconomicNet: 800
      })
    ],
    false
  );

  assert.deepEqual(data.map((datum) => datum.month), ["2026-05", "2026-06", "2026-07"]);
  assert.equal(data[1].hasActivity, false);
  assert.equal(data[1].bar, null);
  assert.equal(data[2].projected, true);
  assert.equal(data[2].net, 800);
  assert.equal(data[2].bar, 800);
});

test("buildProjectionNetData no oculta el presupuesto ni los estimados por falta de historial", () => {
  const data = buildProjectionNetData(
    [],
    [
      projectionMonth("2026-07", { budgetBasis: "budget", budgetIncome: 500, estimatedEconomicNet: 500 }),
      projectionMonth("2026-08", { investmentEstimate: 25, estimatedEconomicNet: 25 }),
      projectionMonth("2026-09", { msiCommitment: 40, estimatedEconomicNet: -40 }),
      projectionMonth("2026-10")
    ],
    false
  );

  assert.deepEqual(data.map((datum) => datum.month), ["2026-07", "2026-08", "2026-09", "2026-10"]);
  assert.equal(data[3].bar, null);
  assert.equal(data[3].hasActivity, false);
});

test("buildProjectionNetData incluye la tendencia completa cuando hay historial suficiente", () => {
  const data = buildProjectionNetData(
    [],
    [
      projectionMonth("2026-07", {
        budgetBasis: "trend",
        baseEconomicBasis: "trend",
        projectedNet: 300,
        estimatedEconomicNet: 300,
        baseEconomicNet: 300,
        adjustedEconomicNet: 300
      })
    ],
    true
  );

  assert.equal(data.length, 1);
  assert.equal(data[0].bar, 300);
});

test("projectionInvestmentSummary acumula estimados y reporta el plan guardado más reciente", () => {
  const summary = projectionInvestmentSummary([
    projectionMonth("2026-07", { investmentEstimate: 10, investmentSourcePlanMonth: "2026-05" }),
    projectionMonth("2026-08", { investmentEstimate: 12.5, investmentSourcePlanMonth: "2026-07" }),
    projectionMonth("2026-09")
  ]);

  assert.equal(summary.hasEstimate, true);
  assert.equal(summary.totalEstimate, 22.5);
  assert.equal(summary.latestSourcePlanMonth, "2026-07");
});

test("projectionInvestmentSummary no inventa estimados cuando no hay plan aplicable", () => {
  const summary = projectionInvestmentSummary([projectionMonth("2026-07"), projectionMonth("2026-08")]);

  assert.equal(summary.hasEstimate, false);
  assert.equal(summary.totalEstimate, 0);
  assert.equal(summary.latestSourcePlanMonth, null);
});

test("projectionMethodNet elige el neto base o el ajustado", () => {
  const month = projectionMonth("2026-07", { baseEconomicNet: 605, adjustedEconomicNet: 585 });

  assert.equal(projectionMethodNet(month, "base"), 605);
  assert.equal(projectionMethodNet(month, "adjusted"), 585);
});

test("projectionNetBreakdown del método ajustado agrega la desviación firmada", () => {
  const month = projectionMonth("2026-07", {
    baseEconomicBasis: "budget",
    budgetIncome: 1200,
    budgetExpense: 400,
    investmentEstimate: 35,
    msiCommitment: 150,
    normalCreditPayment: 80,
    baseEconomicNet: 605,
    deviationAdjustment: -20,
    adjustedEconomicNet: 585
  });

  const rows = projectionNetBreakdown(month, "adjusted");

  assert.deepEqual(rows, [
    { key: "budgetIncome", amount: 1200 },
    { key: "budgetExpense", amount: -400 },
    { key: "investmentEstimate", amount: 35 },
    { key: "msiCommitment", amount: -150 },
    { key: "normalCreditPayment", amount: -80 },
    { key: "deviationAdjustment", amount: -20 },
    { key: "finalNet", amount: 585 }
  ]);
  const parts = rows.filter((row) => row.key !== "finalNet");
  assert.equal(
    parts.reduce((total, row) => total + row.amount, 0),
    month.adjustedEconomicNet
  );
});

test("projectionNetBreakdown no declara desviación cuando el ajuste no aplica", () => {
  const month = projectionMonth("2026-07", {
    baseEconomicBasis: "budget",
    budgetIncome: 900,
    baseEconomicNet: 900,
    adjustedEconomicNet: 900
  });
  const rows = projectionNetBreakdown(month, "adjusted");

  assert.equal(rows.some((row) => row.key === "deviationAdjustment"), false);
  assert.equal(rows.at(-1)?.amount, 900);
});

test("projectionBaseBasisLabel nombra la base real del neto", () => {
  assert.equal(projectionBaseBasisLabel("budget"), "Presupuesto pendiente del periodo");
  assert.equal(projectionBaseBasisLabel("trend"), "Tendencia histórica sin traspasos de crédito");
  assert.equal(projectionBaseBasisLabel("none"), "Sin base histórica ni plan");
});

test("projectionDeviationBreakdown expone los componentes firmados de la muestra", () => {
  const deviation: DashboardProjectionDeviation = {
    windowMonths: ["2026-04", "2026-05", "2026-06"],
    sampledMonths: ["2026-04", "2026-05", "2026-06"],
    sampleSize: 3,
    requiredSampleSize: 3,
    hasSufficientSample: true,
    monthlyAdjustment: -40,
    incomeDeviation: -60,
    expenseDeviation: 30.5,
    unplannedDeviation: -10.5
  };

  assert.deepEqual(projectionDeviationBreakdown(deviation), [
    { key: "incomeDeviation", amount: -60 },
    { key: "expenseDeviation", amount: 30.5 },
    { key: "unplannedDeviation", amount: -10.5 },
    { key: "monthlyAdjustment", amount: -40 }
  ]);
});

test("projectionDeviationBreakdown no presenta componentes cuando la muestra es insuficiente", () => {
  assert.deepEqual(
    projectionDeviationBreakdown({
      windowMonths: ["2026-06"],
      sampledMonths: [],
      sampleSize: 0,
      requiredSampleSize: 3,
      hasSufficientSample: false,
      monthlyAdjustment: 0,
      incomeDeviation: 0,
      expenseDeviation: 0,
      unplannedDeviation: 0
    }),
    []
  );
});

test("buildProjectionNetData lleva ambos métodos y marca si el ajuste aplica", () => {
  const data = buildProjectionNetData(
    [historyMonth("2026-06", true)],
    [
      projectionMonth("2026-07", {
        budgetBasis: "budget",
        baseEconomicBasis: "budget",
        budgetIncome: 1200,
        budgetExpense: 400,
        investmentEstimate: 35,
        msiCommitment: 150,
        normalCreditPayment: 80,
        baseEconomicNet: 605,
        deviationAdjustment: -20,
        adjustedEconomicNet: 585
      })
    ],
    true,
    true
  );

  assert.equal(data[0].baseNet, 100);
  assert.equal(data[0].adjustedNet, 100);
  assert.equal(data[0].deviationApplied, false);
  assert.equal(data[1].baseNet, 605);
  assert.equal(data[1].adjustedNet, 585);
  assert.equal(data[1].deviationApplied, true);
  assert.equal(data[1].bar, 605);
});

test("buildProjectionNetData iguala ajustado a base sin muestra suficiente", () => {
  const data = buildProjectionNetData(
    [],
    [
      projectionMonth("2026-07", {
        budgetBasis: "budget",
        baseEconomicBasis: "budget",
        budgetIncome: 900,
        baseEconomicNet: 900,
        deviationAdjustment: 0,
        adjustedEconomicNet: 900
      })
    ],
    false,
    false
  );

  assert.equal(data[0].deviationApplied, false);
  assert.equal(data[0].adjustedNet, data[0].baseNet);
});
