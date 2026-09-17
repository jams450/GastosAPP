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
