import assert from "node:assert/strict";
import { test } from "node:test";
// El alias `@/` no lo resuelve `node --test`: los imports van con ruta relativa y extensión
// explícita, igual que en los demás archivos `.test.ts` del repositorio.
import {
  normalizeExpectedInvestmentIncome,
  normalizePlanProjection,
  sumExpectedInvestmentIncome,
  type InvestmentPlanProjection
} from "../../../../lib/contracts/investments.ts";
import type { PlanSummary } from "../../../../lib/contracts/plan.ts";
import { summarizePlanIncome } from "./plan-model.ts";

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

function allocation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    investmentProductId: 1,
    accountId: 2,
    productName: "Cetes",
    institution: "cetes",
    institutionLabel: "CETES",
    allocatedAmount: 10000,
    ...overrides
  };
}

function projection(allocations: unknown[]): InvestmentPlanProjection {
  const normalized = normalizePlanProjection({
    investmentPlanId: 7,
    planMonth: "2026-09",
    projectionMonths: 12,
    isPersisted: true,
    allocations
  });

  assert.ok(normalized);
  return normalized;
}

test("normalizeExpectedInvestmentIncome devuelve null ante entrada no-objeto", () => {
  assert.equal(normalizeExpectedInvestmentIncome(null), null);
  assert.equal(normalizeExpectedInvestmentIncome("texto"), null);
  assert.equal(normalizeExpectedInvestmentIncome(42), null);
  assert.equal(normalizeExpectedInvestmentIncome([]), null);
});

test("normalizeExpectedInvestmentIncome exige period yyyy-MM", () => {
  assert.equal(normalizeExpectedInvestmentIncome({}), null);
  assert.equal(normalizeExpectedInvestmentIncome({ period: "" }), null);
  assert.equal(normalizeExpectedInvestmentIncome({ period: "2026-13" }), null);
  assert.equal(normalizeExpectedInvestmentIncome({ period: "09-2026" }), null);
});

test("normalizeExpectedInvestmentIncome conserva hasPlan=false con ceros", () => {
  assert.deepEqual(normalizeExpectedInvestmentIncome({ period: "2026-09", expectedInterest: 0, allocationCount: 0, hasPlan: false }), {
    period: "2026-09",
    expectedInterest: 0,
    allocationCount: 0,
    hasPlan: false
  });
});

test("normalizeExpectedInvestmentIncome coerciona texto numérico y sanea conteo negativo", () => {
  assert.deepEqual(normalizeExpectedInvestmentIncome({ period: "2026-09", expectedInterest: "150.5", allocationCount: "2", hasPlan: true }), {
    period: "2026-09",
    expectedInterest: 150.5,
    allocationCount: 2,
    hasPlan: true
  });

  // Un conteo negativo no es utilizable: se capa a 0 en vez de propagarse a la UI.
  assert.equal(normalizeExpectedInvestmentIncome({ period: "2026-09", allocationCount: -3, hasPlan: true })?.allocationCount, 0);
  // `hasPlan` solo es true con booleano explícito: un "true" serializado no habilita el plan.
  assert.equal(normalizeExpectedInvestmentIncome({ period: "2026-09", hasPlan: "true" })?.hasPlan, false);
});

test("normalizePlanProjection deja un plan sin serie con proyección vacía, sin fabricar", () => {
  const normalized = normalizePlanProjection({
    investmentPlanId: 7,
    planMonth: "2026-09",
    projectionMonths: 12,
    isPersisted: true,
    allocations: [allocation({}), allocation({ investmentProductId: 2 })]
  });

  assert.ok(normalized);
  assert.deepEqual(normalized?.allocations.map((item) => item.projection), [[], []]);
  assert.deepEqual(sumExpectedInvestmentIncome(normalized as InvestmentPlanProjection, "2026-09"), {
    expectedInterest: 0,
    allocationCount: 0
  });
});

test("normalizePlanProjection coerciona Interest serializado como texto", () => {
  const normalized = projection([
    allocation({ projection: [{ monthNumber: 1, month: "2026-09", openingBalance: 10000, interest: "123.45", closingBalance: 10123.45 }] })
  ]);

  assert.equal(normalized.allocations[0].projection[0].interest, 123.45);
});

test("sumExpectedInvestmentIncome suma todas las asignaciones del mes e ignora otros meses", () => {
  const result = sumExpectedInvestmentIncome(
    projection([
      allocation({
        projection: [
          { monthNumber: 1, month: "2026-09", openingBalance: 10000, interest: 100, closingBalance: 10100 },
          { monthNumber: 2, month: "2026-10", openingBalance: 10100, interest: 500, closingBalance: 10600 }
        ]
      }),
      allocation({
        investmentProductId: 2,
        projection: [{ monthNumber: 1, month: "2026-09", openingBalance: 5000, interest: 50.255, closingBalance: 5050.26 }]
      })
    ]),
    "2026-09"
  );

  // 100 + 50.255 con redondeo a dos decimales; el interés de octubre no entra en septiembre.
  assert.deepEqual(result, { expectedInterest: 150.26, allocationCount: 2 });
});

test("sumExpectedInvestmentIncome devuelve ceros cuando el mes está ausente", () => {
  const result = sumExpectedInvestmentIncome(
    projection([allocation({ projection: [{ monthNumber: 2, month: "2026-10", openingBalance: 10000, interest: 100, closingBalance: 10100 }] })]),
    "2026-09"
  );

  assert.deepEqual(result, { expectedInterest: 0, allocationCount: 0 });
});

test("sumExpectedInvestmentIncome ignora filas con interés no finito sin contar la asignación", () => {
  const result = sumExpectedInvestmentIncome(
    projection([
      allocation({
        projection: [{ monthNumber: 1, month: "2026-09", openingBalance: 10000, interest: "abc", closingBalance: 10000 }]
      }),
      allocation({
        investmentProductId: 2,
        projection: [{ monthNumber: 1, month: "2026-09", openingBalance: 5000, interest: 25, closingBalance: 5025 }]
      })
    ]),
    "2026-09"
  );

  // La fila malformada no aporta ni se cuenta: solo la segunda asignación contribuye.
  assert.deepEqual(result, { expectedInterest: 25, allocationCount: 1 });
});

test("summarizePlanIncome muestra el pendiente negativo tal cual cuando lo ejecutado supera lo programado", () => {
  const income = summarizePlanIncome(summary({ plannedIncome: 10000, committedIncome: 2000, projectedIncome: 500, executedIncome: 12500 }));

  // Decisión: no se capa a 0. Un pendiente negativo informa que ingresó más de lo programado y
  // la UI lo rotula como tal; caparlo escondería el excedente.
  assert.equal(income.pendingIncome, -2500);
  assert.equal(income.executedIncome, 12500);
});

test("summarizePlanIncome conserva el proyectado (promedios) junto al resto de cifras", () => {
  const income = summarizePlanIncome(summary({ plannedIncome: 20000, committedIncome: 5000, projectedIncome: 1200, executedIncome: 18000 }));

  assert.deepEqual(income, {
    plannedIncome: 20000,
    committedIncome: 5000,
    projectedIncome: 1200,
    executedIncome: 18000,
    pendingIncome: 2000
  });
});
