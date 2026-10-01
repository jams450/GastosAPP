import assert from "node:assert/strict";
import { test } from "node:test";
// El alias `@/` no lo resuelve `node --test`: los imports de valor van con ruta relativa y
// extensión explícita, igual que en los demás archivos `.test.ts` del repositorio.
import type { BudgetPeriodStatus } from "../../../../lib/contracts/budgets";
import { normalizePlanSummary, type PlanItemVariance, type PlanSummary } from "../../../../lib/contracts/plan.ts";
import {
  isPlanSummaryEmpty,
  sortPlanItems,
  summarizePlanIncome,
  summarizePlanItemCounts,
  summarizePlanTotals,
  summarizeVariances
} from "./plan-model.ts";

function status(overrides: Partial<BudgetPeriodStatus> = {}): BudgetPeriodStatus {
  return {
    budgetId: 1,
    name: "Comida",
    periodKey: "2026-09",
    categoryId: 7,
    subcategoryId: null,
    active: true,
    amountMxn: 1000,
    spent: 0,
    spentPercent: 0,
    committed: 0,
    committedPercent: 0,
    projected: 0,
    projectedPercent: 0,
    effective: 0,
    forecast: 0,
    thresholdPercent: 0,
    remaining: 1000,
    plannedAmount: 0,
    variance: 0,
    itemsPending: 0,
    itemsExecuted: 0,
    itemsUnexecuted: 0,
    itemsIgnored: 0,
    plannedIncome: 0,
    committedIncome: 0,
    projectedIncome: 0,
    percentUsed: 0,
    status: "ok",
    reachedThreshold: null,
    ...overrides
  };
}

function summary(overrides: Partial<PlanSummary> = {}): PlanSummary {
  return {
    periodKey: "2026-09",
    budgets: [],
    plannedIncome: 0,
    committedIncome: 0,
    projectedIncome: 0,
    executedIncome: 0,
    variances: [],
    itemsWithoutBudget: [],
    accountFlows: [],
    ...overrides
  };
}

function variance(overrides: Partial<PlanItemVariance> = {}): PlanItemVariance {
  return {
    itemId: 1,
    name: "Partida",
    kind: "expense",
    plannedAmount: 1000,
    executedAmount: 1000,
    variance: 0,
    ...overrides
  };
}

test("summarizePlanTotals solo acumula presupuestos activos y mide el restante contra effective", () => {
  const totals = summarizePlanTotals(
    summary({
      budgets: [
        status({ budgetId: 1, amountMxn: 1000, spent: 400, committed: 100, projected: 50 }),
        status({ budgetId: 2, amountMxn: 500, spent: 100, committed: 0, projected: 0 }),
        // Inactivo: se cuenta, pero no suma ni gasto ni límite.
        status({ budgetId: 3, active: false, amountMxn: 9000, spent: 9000, committed: 9000 })
      ]
    })
  );

  assert.equal(totals.budgeted, 1500);
  assert.equal(totals.spent, 500);
  assert.equal(totals.committed, 100);
  assert.equal(totals.projected, 50);
  assert.equal(totals.effective, 600);
  assert.equal(totals.forecast, 650);
  assert.equal(totals.remaining, 900);
  assert.equal(totals.activeBudgets, 2);
  assert.equal(totals.totalBudgets, 3);

  // Los porcentajes se miden contra el límite activo y se redondean a 2 decimales.
  assert.equal(totals.spentPercent, 33.33);
  assert.equal(totals.committedPercent, 6.67);
  assert.equal(totals.totalPercent, 40);
});

test("summarizePlanTotals no divide por cero sin límite activo", () => {
  const totals = summarizePlanTotals(summary({ budgets: [status({ active: false, amountMxn: 1000 })] }));

  assert.equal(totals.budgeted, 0);
  assert.equal(totals.spentPercent, 0);
  assert.equal(totals.committedPercent, 0);
  assert.equal(totals.totalPercent, 0);
  assert.equal(totals.activeBudgets, 0);
  assert.equal(totals.totalBudgets, 1);
});

test("summarizePlanItemCounts suma los conteos y excluye las canceladas del total", () => {
  const counts = summarizePlanItemCounts(
    summary({
      budgets: [
        status({ budgetId: 1, itemsPending: 2, itemsExecuted: 1, itemsUnexecuted: 0, itemsIgnored: 1 }),
        status({ budgetId: 2, itemsPending: 0, itemsExecuted: 3, itemsUnexecuted: 2, itemsIgnored: 0 })
      ]
    })
  );

  assert.equal(counts.pending, 2);
  assert.equal(counts.executed, 4);
  assert.equal(counts.unexecuted, 2);
  assert.equal(counts.ignored, 1);
  // total = pending + executed + ignored: `unexecuted` describe a las pending caducadas,
  // no es una categoría extra, y `cancelled` no llega en el payload porque libera su monto.
  assert.equal(counts.total, 7);
});

test("summarizeVariances separa sobrecosto de ahorro y guarda la peor desviación", () => {
  const result = summarizeVariances([
    variance({ itemId: 1, variance: -100 }),
    variance({ itemId: 2, variance: 50 }),
    variance({ itemId: 3, variance: -300 }),
    variance({ itemId: 4, variance: 0 })
  ]);

  assert.equal(result.count, 4);
  assert.equal(result.netVariance, -350);
  assert.equal(result.overPlannedCount, 2);
  assert.equal(result.underPlannedCount, 1, "una variación exactamente 0 no es ni sobrecosto ni ahorro");
  assert.equal(result.worstVariance?.itemId, 3, "se guarda la desviación más negativa");

  const empty = summarizeVariances([]);
  assert.equal(empty.count, 0);
  assert.equal(empty.netVariance, 0);
  assert.equal(empty.worstVariance, null);
  assert.equal(empty.overPlannedCount, 0);
});

test("summarizePlanIncome deja el ingreso pendiente como planificado menos ejecutado", () => {
  const income = summarizePlanIncome(
    summary({ plannedIncome: 20000, committedIncome: 5000, projectedIncome: 1000, executedIncome: 18000 })
  );

  assert.deepEqual(income, {
    plannedIncome: 20000,
    committedIncome: 5000,
    projectedIncome: 1000,
    executedIncome: 18000,
    pendingIncome: 2000
  });
});

test("sortPlanItems ordena por fecha y desempata por nombre sin mutar la entrada", () => {
  const items = [
    { itemId: 1, plannedDate: "2026-09-20T00:00:00", name: "Zeta" },
    { itemId: 2, plannedDate: "2026-09-01T00:00:00", name: "Beta" },
    { itemId: 3, plannedDate: "2026-09-01T00:00:00", name: "Alfa" },
    { itemId: 4, plannedDate: null, name: "Sin fecha" }
  ];

  const sorted = sortPlanItems(items as never);
  assert.deepEqual(sorted.map((item) => item.itemId), [3, 2, 1, 4], "sin fecha queda al final");
  assert.deepEqual(items.map((item) => item.itemId), [1, 2, 3, 4], "la entrada no se muta");
});

test("isPlanSummaryEmpty exige que todas las colecciones estén vacías", () => {
  assert.equal(isPlanSummaryEmpty(summary()), true);

  assert.equal(isPlanSummaryEmpty(summary({ budgets: [status()] })), false);
  assert.equal(isPlanSummaryEmpty(summary({ variances: [variance()] })), false);
  assert.equal(
    isPlanSummaryEmpty(summary({ accountFlows: [{ accountId: 1, plannedExpense: 1, plannedIncome: 0, itemCount: 1 }] })),
    false
  );
});

test("normalizePlanSummary tolera payloads incompletos sin fabricar datos", () => {
  assert.equal(normalizePlanSummary(null), null);
  assert.equal(normalizePlanSummary("texto"), null);

  const empty = normalizePlanSummary({});
  assert.ok(empty);
  assert.equal(empty?.periodKey, "");
  assert.deepEqual(empty?.budgets, []);
  assert.deepEqual(empty?.variances, []);
  assert.deepEqual(empty?.itemsWithoutBudget, []);
  assert.deepEqual(empty?.accountFlows, []);

  // PascalCase (serializador .NET) y camello deben normalizarse igual.
  const pascal = normalizePlanSummary({ PeriodKey: "2026-08", PlannedIncome: "1500" });
  assert.equal(pascal?.periodKey, "2026-08");
  assert.equal(pascal?.plannedIncome, 1500, "un ingreso serializado como texto se coerciona");

  // Una variación sin identidad se descarta; sus hermanas válidas se conservan.
  const mixed = normalizePlanSummary({
    variances: [{ itemId: 0, variance: 10 }, { itemId: 5, name: "Válida", plannedAmount: 100, executedAmount: 90, variance: 10 }]
  });
  assert.equal(mixed?.variances.length, 1);
  assert.equal(mixed?.variances[0].itemId, 5);

  // Un flujo sin cuenta tampoco entra: no se puede atribuir a nadie.
  const flows = normalizePlanSummary({ accountFlows: [{ planEedExpense: 1 }, { accountId: 3, plannedExpense: 500, itemCount: 2 }] });
  assert.deepEqual(flows?.accountFlows, [{ accountId: 3, plannedExpense: 500, plannedIncome: 0, itemCount: 2 }]);
});
