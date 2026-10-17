import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDashboardOverview, normalizeDashboardProjection } from "./dashboard.ts";

test("normalizeDashboardProjection returns safe defaults for unusable input", () => {
  for (const input of [null, undefined, 42, "projection", []]) {
    const result = normalizeDashboardProjection(input);

    assert.deepEqual(result.months, []);
    assert.deepEqual(result.msiPlans, []);
    assert.equal(result.cashRealBalance, 0);
    assert.equal(result.horizonMonths, 0);
    assert.equal(result.asOfDate, null);
    assert.equal(result.trend.hasSufficientHistory, false);
  }
});

test("normalizeDashboardProjection coerces money and derives missing net", () => {
  const result = normalizeDashboardProjection({
    months: [{ month: "2026-10", projectedCashBalance: "1500.5", msiCommitment: "250" }, { projectedNet: 10 }],
    historicalMonths: [{ month: "2026-09", income: "1000", expense: "1250.25" }]
  });

  assert.equal(result.months.length, 1);
  assert.equal(result.months[0].projectedCashBalance, 1500.5);
  assert.equal(result.months[0].msiCommitment, 250);
  assert.equal(result.months[0].projectedNet, 0);
  assert.equal(result.months[0].msiPaymentScenarioBalance, null);
  assert.equal(result.historicalMonths[0].net, -250.25);
  assert.equal(result.horizonMonths, 1);
});

test("normalizeDashboardProjection marca ausencia de historial sin fabricar ceros", () => {
  const result = normalizeDashboardProjection({
    historicalMonths: [
      { month: "2026-07", income: 0, expense: 0, hasActivity: false },
      { month: "2026-08", income: "1000", expense: "0", hasActivity: false },
      { month: "2026-09", income: "1000", expense: "250" }
    ]
  });

  assert.equal(result.historicalMonths[0].hasActivity, false);
  // El flag explícito manda aunque los importes no sean cero.
  assert.equal(result.historicalMonths[1].hasActivity, false);
  // Sin flag, se deriva de income/expense.
  assert.equal(result.historicalMonths[2].hasActivity, true);
});

test("normalizeDashboardProjection clamps horizonMonths and keeps trend flags explicit", () => {
  const result = normalizeDashboardProjection({
    horizonMonths: 0,
    months: [{ month: "2026-10" }, { month: "2026-11" }],
    trend: { sampleMonths: "9", projectedMonthlyNet: 300, hasSufficientHistory: "true" }
  });

  assert.equal(result.horizonMonths, 2);
  assert.equal(result.trend.sampleMonths, 9);
  assert.equal(result.trend.projectedMonthlyNet, 300);
  assert.equal(result.trend.hasSufficientHistory, false);
});

test("normalizeDashboardProjection drops plans without identity and keeps schedule flags", () => {
  const result = normalizeDashboardProjection({
    msiPlans: [
      { planId: 7, accountId: "3", accountName: "   ", remainingAmount: 900, openInstallments: "4", scheduleComplete: false },
      { remainingAmount: 500 },
      { accountId: 4, accountName: "Tarjeta", nextDueAmount: "0", endsOn: "2027-01-15" }
    ]
  });

  assert.equal(result.msiPlans.length, 2);
  assert.deepEqual(result.msiPlans[0], {
    planId: "7",
    accountId: 3,
    accountName: "Cuenta sin nombre",
    remainingAmount: 900,
    openInstallments: 4,
    nextDueDate: null,
    nextDueAmount: null,
    endsOn: null,
    description: null,
    scheduleComplete: false
  });
  assert.equal(result.msiPlans[1].nextDueAmount, 0);
  assert.equal(result.msiPlans[1].scheduleComplete, true);
});

test("normalizeDashboardProjection conserva el desglose de presupuesto, inversión y neto final", () => {
  const result = normalizeDashboardProjection({
    months: [
      {
        month: "2026-07",
        projectedCashBalance: "1000",
        projectedNet: "800",
        msiCommitment: "150.5",
        msiPaymentScenarioBalance: "900",
        budgetBasis: "budget",
        budgetIncome: "1200",
        budgetExpense: "400",
        investmentEstimate: "35.25",
        investmentSourcePlanMonth: "2026-06",
        estimatedEconomicNet: "684.75"
      }
    ]
  });

  assert.deepEqual(result.months[0], {
    month: "2026-07",
    projectedCashBalance: 1000,
    projectedNet: 800,
    msiCommitment: 150.5,
    msiPaymentScenarioBalance: 900,
    budgetBasis: "budget",
    budgetIncome: 1200,
    budgetExpense: 400,
    investmentEstimate: 35.25,
    investmentSourcePlanMonth: "2026-06",
    estimatedEconomicNet: 684.75,
    normalCreditPayment: 0,
    baseEconomicBasis: "budget",
    baseEconomicNet: 684.75,
    deviationAdjustment: 0,
    adjustedEconomicNet: 684.75
  });
});

test("normalizeDashboardProjection conserva el neto base, crédito normal y desviación del backend", () => {
  const result = normalizeDashboardProjection({
    months: [
      {
        month: "2026-07",
        projectedNet: "800",
        msiCommitment: "150.5",
        investmentEstimate: "35.25",
        normalCreditPayment: "120.25",
        baseEconomicBasis: "trend",
        baseEconomicNet: "564.5",
        deviationAdjustment: "-40",
        adjustedEconomicNet: "524.5"
      }
    ],
    deviation: {
      windowMonths: ["2026-04", "2026-05", "2026-06"],
      sampledMonths: ["2026-04", "2026-05", "2026-06"],
      sampleSize: 3,
      requiredSampleSize: 3,
      hasSufficientSample: true,
      monthlyAdjustment: "-40",
      incomeDeviation: "-60",
      expenseDeviation: "30.5",
      unplannedDeviation: "-10.5"
    }
  });
  const month = result.months[0];

  assert.equal(month.normalCreditPayment, 120.25);
  assert.equal(month.baseEconomicBasis, "trend");
  assert.equal(month.baseEconomicNet, 564.5);
  assert.equal(month.deviationAdjustment, -40);
  assert.equal(month.adjustedEconomicNet, 524.5);
  assert.equal(result.deviation.hasSufficientSample, true);
  assert.deepEqual(result.deviation.sampledMonths, ["2026-04", "2026-05", "2026-06"]);
  assert.equal(result.deviation.monthlyAdjustment, -40);
  assert.equal(result.deviation.incomeDeviation, -60);
  assert.equal(result.deviation.expenseDeviation, 30.5);
  assert.equal(result.deviation.unplannedDeviation, -10.5);
});

test("normalizeDashboardProjection no inventa crédito normal ni desviación en payloads legacy", () => {
  const result = normalizeDashboardProjection({
    months: [{ month: "2026-07", projectedNet: "500", msiCommitment: "120", budgetBasis: "trend" }]
  });
  const month = result.months[0];

  assert.equal(month.normalCreditPayment, 0);
  assert.equal(month.baseEconomicBasis, "trend");
  // Legacy: el neto base es el neto final heredado y el ajustado no se declara soportado.
  assert.equal(month.baseEconomicNet, month.estimatedEconomicNet);
  assert.equal(month.deviationAdjustment, 0);
  assert.equal(month.adjustedEconomicNet, month.baseEconomicNet);
  assert.equal(result.deviation.hasSufficientSample, false);
  assert.equal(result.deviation.requiredSampleSize, 0);
  assert.equal(result.deviation.monthlyAdjustment, 0);
  assert.deepEqual(result.deviation.windowMonths, []);
});

test("normalizeDashboardProjection cero desviación sin muestra suficiente aunque el backend mienta", () => {
  const result = normalizeDashboardProjection({
    months: [{ month: "2026-07", baseEconomicNet: 100, deviationAdjustment: 50, adjustedEconomicNet: 150 }],
    deviation: {
      windowMonths: ["2026-05", "2026-06"],
      sampledMonths: ["2026-05"],
      sampleSize: 1,
      requiredSampleSize: 3,
      hasSufficientSample: false,
      monthlyAdjustment: 50,
      incomeDeviation: 50,
      expenseDeviation: 0,
      unplannedDeviation: 0
    }
  });

  assert.equal(result.deviation.hasSufficientSample, false);
  assert.equal(result.deviation.monthlyAdjustment, 0);
  assert.equal(result.deviation.incomeDeviation, 0);
  // Sin muestra suficiente el ajuste no puede presentarse como conocido.
  assert.equal(result.months[0].adjustedEconomicNet, 150);
});

test("normalizeDashboardProjection sanea meses ilegibles de la muestra de desviación", () => {
  const result = normalizeDashboardProjection({
    deviation: {
      windowMonths: ["2026-05", "mayo", 202606, null, "2026-06"],
      sampledMonths: ["2026-06"],
      sampleSize: 3,
      requiredSampleSize: 3,
      hasSufficientSample: true
    }
  });

  assert.deepEqual(result.deviation.windowMonths, ["2026-05", "2026-06"]);
  assert.deepEqual(result.deviation.sampledMonths, ["2026-06"]);
});

test("normalizeDashboardProjection deriva el neto final en payloads legacy sin fabricar inversión", () => {
  const result = normalizeDashboardProjection({
    months: [{ month: "2026-07", projectedNet: "500", msiCommitment: "120" }]
  });
  const month = result.months[0];

  assert.equal(month.investmentEstimate, 0);
  assert.equal(month.investmentSourcePlanMonth, null);
  assert.equal(month.budgetBasis, "none");
  assert.equal(month.budgetIncome, 0);
  assert.equal(month.budgetExpense, 0);
  // Legacy: neto final = projectedNet - msiCommitment (yield 0).
  assert.equal(month.estimatedEconomicNet, 380);
});

test("normalizeDashboardProjection respeta el neto final explícito, aunque sea cero", () => {
  const result = normalizeDashboardProjection({
    months: [{ month: "2026-07", projectedNet: 500, msiCommitment: 120, investmentEstimate: 20, estimatedEconomicNet: 0 }]
  });

  assert.equal(result.months[0].estimatedEconomicNet, 0);
});

test("normalizeDashboardProjection sanea un basis desconocido y un plan de inversión ilegible", () => {
  const result = normalizeDashboardProjection({
    months: [
      { month: "2026-07", budgetBasis: "proyeccion", investmentEstimate: "12", investmentSourcePlanMonth: "junio" },
      { month: "2026-08", budgetBasis: "trend", investmentSourcePlanMonth: 202606 }
    ]
  });

  assert.equal(result.months[0].budgetBasis, "none");
  assert.equal(result.months[0].investmentEstimate, 12);
  assert.equal(result.months[0].investmentSourcePlanMonth, null);
  assert.equal(result.months[1].budgetBasis, "trend");
  assert.equal(result.months[1].investmentSourcePlanMonth, null);
});

test("normalizeDashboardOverview tolera creditAvailable ausente o presente", () => {
  const result = normalizeDashboardOverview({
    accounts: [
      { accountId: 1, name: "Tarjeta sin campo", active: true, isCredit: true, creditLimit: 10000, normalOutstanding: "2500", msiOutstanding: 1500 },
      { accountId: 2, name: "Tarjeta con campo", active: true, isCredit: true, creditLimit: "5000", creditAvailable: "1234.5" }
    ]
  });

  assert.equal(result.accounts.length, 2);
  assert.equal(result.accounts[0].creditAvailable, null);
  assert.equal(result.accounts[0].normalOutstanding, 2500);
  assert.equal(result.accounts[1].creditAvailable, 1234.5);
});

test("normalizeDashboardOverview usa currentDebt canónico y lo deriva si falta", () => {
  const result = normalizeDashboardOverview({
    accounts: [
      { accountId: 1, name: "Derivada", active: true, isCredit: true, normalOutstanding: "2500", msiOutstanding: 1500 },
      { accountId: 2, name: "Canónica", active: true, isCredit: true, normalOutstanding: 10, msiOutstanding: 20, currentDebt: "999.5" },
      { accountId: 3, name: "Ajustada", active: true, isCredit: true, normalOutstanding: 10, msiOutstanding: 20, currentDebt: 0 }
    ]
  });

  assert.equal(result.accounts[0].currentDebt, 4000);
  assert.equal(result.accounts[1].currentDebt, 999.5);
  assert.equal(result.accounts[2].currentDebt, 0);
});

test("normalizeDashboardOverview conserva el snapshot de crédito del backend", () => {
  const result = normalizeDashboardOverview({
    creditSummary: {
      totalAvailable: "12000.5",
      totalLimit: "20000",
      totalDebt: "7999.5",
      totalNormalDebt: "3000",
      totalMsiDebt: "4999.5",
      pendingNormal: "3000",
      pendingMsi: "4999.5"
    }
  });

  assert.equal(result.creditSummary.totalAvailable, 12000.5);
  assert.equal(result.creditSummary.totalLimit, 20000);
  assert.equal(result.creditSummary.totalDebt, 7999.5);
  assert.equal(result.creditSummary.totalNormalDebt, 3000);
  assert.equal(result.creditSummary.totalMsiDebt, 4999.5);
  assert.equal(result.creditSummary.pendingNormal, 3000);
  assert.equal(result.creditSummary.pendingMsi, 4999.5);
});

test("normalizeDashboardOverview devuelve snapshot de crédito en cero sin datos", () => {
  const result = normalizeDashboardOverview(null);

  assert.equal(result.creditSummary.totalAvailable, 0);
  assert.equal(result.creditSummary.totalLimit, 0);
  assert.equal(result.creditSummary.totalDebt, 0);
  assert.equal(result.creditSummary.totalNormalDebt, 0);
  assert.equal(result.creditSummary.totalMsiDebt, 0);
});

test("normalizeDashboardOverview conserva el desglose aditivo de efectivo del backend", () => {
  const result = normalizeDashboardOverview({
    cashSummary: {
      total: "1500",
      monthIncome: "2000",
      monthExpense: "450",
      monthNet: "1550",
      monthFinancialNet: "1550",
      monthDirectExpense: "150",
      monthCardPayment: "300",
      monthInternalCashTransfer: "200",
      monthCashOutflow: "450"
    }
  });

  assert.equal(result.cashSummary.hasCashFlowBreakdown, true);
  assert.equal(result.cashSummary.monthDirectExpense, 150);
  assert.equal(result.cashSummary.monthCardPayment, 300);
  assert.equal(result.cashSummary.monthInternalCashTransfer, 200);
  assert.equal(result.cashSummary.monthCashOutflow, 450);
  // Campos heredados intactos para consumidores y proyecciones.
  assert.equal(result.cashSummary.monthExpense, 450);
  assert.equal(result.cashSummary.monthFinancialNet, 1550);
});

test("normalizeDashboardOverview no inventa desglose de efectivo en payloads legacy", () => {
  const result = normalizeDashboardOverview({
    cashSummary: { monthIncome: 2000, monthExpense: 450 }
  });

  assert.equal(result.cashSummary.hasCashFlowBreakdown, false);
  assert.equal(result.cashSummary.monthDirectExpense, 0);
  assert.equal(result.cashSummary.monthCardPayment, 0);
  assert.equal(result.cashSummary.monthInternalCashTransfer, 0);
  assert.equal(result.cashSummary.monthCashOutflow, 0);
  assert.equal(result.cashSummary.monthExpense, 450);
});

test("normalizeDashboardOverview deriva la salida total cuando falta y respeta el cero explícito", () => {
  const derived = normalizeDashboardOverview({
    cashSummary: { monthDirectExpense: 150, monthCardPayment: 300 }
  });
  const explicitZero = normalizeDashboardOverview({
    cashSummary: { monthDirectExpense: 0, monthCardPayment: 0, monthCashOutflow: 0 }
  });

  assert.equal(derived.cashSummary.hasCashFlowBreakdown, true);
  assert.equal(derived.cashSummary.monthCashOutflow, 450);
  assert.equal(explicitZero.cashSummary.hasCashFlowBreakdown, true);
  assert.equal(explicitZero.cashSummary.monthCashOutflow, 0);
});

test("normalizeDashboardOverview sin cashSummary deja el desglose ausente y en cero", () => {
  const result = normalizeDashboardOverview({});

  assert.equal(result.cashSummary.hasCashFlowBreakdown, false);
  assert.equal(result.cashSummary.monthCashOutflow, 0);
  assert.equal(result.cashSummary.monthCardPayment, 0);
});
