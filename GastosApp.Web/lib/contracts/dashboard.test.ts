import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDashboardProjection } from "./dashboard.ts";

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
  assert.equal(result.months[0].msiPaymentScenarioBalance, 1500.5);
  assert.equal(result.historicalMonths[0].net, -250.25);
  assert.equal(result.horizonMonths, 1);
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
    scheduleComplete: false
  });
  assert.equal(result.msiPlans[1].nextDueAmount, 0);
  assert.equal(result.msiPlans[1].scheduleComplete, true);
});
