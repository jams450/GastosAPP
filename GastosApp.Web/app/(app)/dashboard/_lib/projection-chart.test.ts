import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProjectionChartLayout, hasHistoryActivity } from "./projection-chart.ts";
import type { DashboardProjectionHistoricalMonth, DashboardProjectionMonth } from "@/lib/contracts/dashboard";

function historyMonth(month: string, hasActivity: boolean): DashboardProjectionHistoricalMonth {
  return { month, income: hasActivity ? 100 : 0, expense: 0, net: hasActivity ? 100 : 0, hasActivity };
}

function projectionMonth(month: string): DashboardProjectionMonth {
  return { month, projectedCashBalance: 1000, projectedNet: 0, msiCommitment: 0, msiPaymentScenarioBalance: null };
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
