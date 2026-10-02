import assert from "node:assert/strict";
import { test } from "node:test";
import type { BudgetItem } from "../../../../lib/contracts/budget-items.ts";
import type { RecurringItem } from "../../../../lib/contracts/recurring-items.ts";
import {
  asTemplateCandidate,
  daysInBudgetMonth,
  findTemplateBudgetItem,
  isTemplateInPeriod,
  pendingTemplatesForPeriod,
  resolveTemplatePlannedDate,
  templateFirstPeriod,
  toTemplateWritePayload
} from "./budget-template-occurrence.ts";

function template(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recurringItemId: 7,
    kind: "expense",
    name: "Renta",
    amountMode: "fixed",
    amountMxn: 1000,
    dayOfMonth: 5,
    categoryId: 3,
    subcategoryId: null,
    accountId: null,
    merchantId: null,
    startsPeriod: "2026-01",
    endsPeriod: null,
    active: true,
    autoExecute: false,
    effectiveFrom: null,
    created: null,
    updated: null,
    ...overrides
  };
}

function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    itemId: 1,
    periodKey: "2026-09",
    kind: "expense",
    name: "Renta",
    plannedAmount: 1000,
    plannedDate: "2026-09-05T00:00:00",
    categoryId: 3,
    subcategoryId: null,
    accountId: null,
    merchantId: null,
    recurringItemId: null,
    status: "pending",
    isProjected: false,
    transactionId: null,
    source: "manual",
    notes: null,
    created: null,
    updated: null,
    ...overrides
  };
}

test("daysInBudgetMonth respeta el calendario sin pasar por Date", () => {
  assert.equal(daysInBudgetMonth("2026-02"), 28);
  assert.equal(daysInBudgetMonth("2024-02"), 29, "bisiesto");
  assert.equal(daysInBudgetMonth("2026-04"), 30);
  assert.equal(daysInBudgetMonth("2026-01"), 31);

  for (const period of ["2026-13", "2026-1", "09-2026", "", "  "]) {
    assert.equal(daysInBudgetMonth(period), null, `periodo inválido: ${period}`);
  }
});

test("resolveTemplatePlannedDate fija el día con clamp a fin de mes", () => {
  assert.equal(resolveTemplatePlannedDate(5, "2026-09"), "2026-09-05");
  assert.equal(resolveTemplatePlannedDate(31, "2026-02"), "2026-02-28", "31 en febrero no bisiesto");
  assert.equal(resolveTemplatePlannedDate(31, "2024-02"), "2024-02-29", "31 en febrero bisiesto");
  assert.equal(resolveTemplatePlannedDate(31, "2026-04"), "2026-04-30");
  assert.equal(resolveTemplatePlannedDate(30, "2026-02"), "2026-02-28");

  for (const day of [0, -3, 32, 99, "cinco", null, undefined, {}, NaN]) {
    assert.equal(resolveTemplatePlannedDate(day, "2026-09"), null, `día inválido: ${String(day)}`);
  }

  assert.equal(resolveTemplatePlannedDate(5, "2026-13"), null);
});

test("asTemplateCandidate rechaza la entrada no-objeto y la fila ilegible", () => {
  for (const input of [null, undefined, 42, "Renta", [], true]) {
    assert.equal(asTemplateCandidate(input), null, `entrada no-objeto: ${String(input)}`);
  }

  assert.equal(asTemplateCandidate(template({ recurringItemId: 0 })), null);
  assert.equal(asTemplateCandidate(template({ dayOfMonth: 0 })), null);
  assert.equal(asTemplateCandidate(template({ dayOfMonth: 32 })), null);
  assert.equal(asTemplateCandidate(template({ name: "   " })), null);
  assert.equal(asTemplateCandidate(template({ kind: "" })), null);
  assert.equal(asTemplateCandidate(template({ startsPeriod: "2026-13" })), null);
  assert.equal(asTemplateCandidate(template({ endsPeriod: "ayer" })), null);
  assert.equal(asTemplateCandidate(template({ active: "sí" })), null, "sin bandera inventada");

  const valid = asTemplateCandidate(template());
  assert.ok(valid);
  assert.equal(valid?.recurringItemId, 7);
  assert.equal(valid?.name, "Renta");
});

test("templateFirstPeriod e isTemplateInPeriod replican la ventana del backend", () => {
  const base = asTemplateCandidate(template()) as RecurringItem;

  assert.equal(templateFirstPeriod(base), "2026-01");
  assert.equal(isTemplateInPeriod(base, "2026-09"), true);
  assert.equal(isTemplateInPeriod(base, "2025-12"), false, "antes de startsPeriod");
  assert.equal(isTemplateInPeriod(base, "2026-13"), false);

  const withEnd = asTemplateCandidate(template({ endsPeriod: "2026-09" })) as RecurringItem;
  assert.equal(isTemplateInPeriod(withEnd, "2026-09"), true, "endsPeriod es inclusivo");
  assert.equal(isTemplateInPeriod(withEnd, "2026-10"), false);

  const futureStart = asTemplateCandidate(template({ effectiveFrom: "2026-10-15T00:00:00" })) as RecurringItem;
  assert.equal(templateFirstPeriod(futureStart), "2026-10");
  assert.equal(isTemplateInPeriod(futureStart, "2026-09"), false, "effectiveFrom futuro aún no aplica");
  assert.equal(isTemplateInPeriod(futureStart, "2026-10"), true);

  const pastEffective = asTemplateCandidate(template({ effectiveFrom: "2025-05-03T00:00:00" })) as RecurringItem;
  assert.equal(templateFirstPeriod(pastEffective), "2026-01", "effectiveFrom anterior no adelanta el inicio");
});

test("findTemplateBudgetItem detecta la partida que ya cubre la plantilla", () => {
  const candidate = asTemplateCandidate(template()) as RecurringItem;

  // Por ligue directo, aunque el nombre haya cambiado tras el alta.
  const linked = findTemplateBudgetItem([item({ recurringItemId: 7, name: "Otro nombre" })], candidate, "2026-09");
  assert.equal((linked as BudgetItem | null)?.recurringItemId, 7);

  // Por clave de ocurrencia (kind + name) cuando aún no hay ligue.
  const byName = findTemplateBudgetItem([item()], candidate, "2026-09");
  assert.equal((byName as BudgetItem | null)?.name, "Renta");

  // Otro mes u otro tipo no cubren.
  assert.equal(findTemplateBudgetItem([item({ periodKey: "2026-08", recurringItemId: 7 })], candidate, "2026-09"), null);
  assert.equal(findTemplateBudgetItem([item({ kind: "income" })], candidate, "2026-09"), null);
  assert.equal(findTemplateBudgetItem([item()], candidate, "2026-08"), null);

  // Entrada no-arreglo o periodo inválido: sin partida inventada.
  for (const items of [null, undefined, {}, "lista"]) {
    assert.equal(findTemplateBudgetItem(items, candidate, "2026-09"), null);
  }
  assert.equal(findTemplateBudgetItem([item()], candidate, "2026-13"), null);

  // Elementos no-objeto se saltan sin romper la búsqueda.
  const mixed = findTemplateBudgetItem([null, "fila", item({ recurringItemId: 7 })], candidate, "2026-09");
  assert.equal((mixed as BudgetItem | null)?.recurringItemId, 7);
});

test("pendingTemplatesForPeriod deja solo las que pueden entrar en un clic", () => {
  const rows = [
    template({ recurringItemId: 1, kind: "income", name: "Sueldo", dayOfMonth: 1 }),
    template({ recurringItemId: 2, kind: "expense", name: "Renta" }),
    template({ recurringItemId: 3, kind: "expense", name: "Inactiva", active: false }),
    template({ recurringItemId: 4, kind: "expense", name: "Futura", startsPeriod: "2026-10" }),
    template({ recurringItemId: 5, kind: "expense", name: "Vencida", endsPeriod: "2026-08" }),
    "no-objeto",
    null
  ];
  const items = [item({ kind: "expense", name: "Renta" })];

  const pending = pendingTemplatesForPeriod(rows, items, "2026-09");
  assert.deepEqual(
    pending.map((row) => row.recurringItemId),
    [1],
    "solo Sueldo: Renta ya tiene partida, el resto no aplica"
  );

  assert.deepEqual(pendingTemplatesForPeriod("no-arreglo", items, "2026-09"), []);
  assert.deepEqual(pendingTemplatesForPeriod(rows, items, "2026-13"), []);
});

test("toTemplateWritePayload mapea plantilla a alta sin prellenar lo que deriva el backend", () => {
  assert.deepEqual(toTemplateWritePayload(template(), "2026-09"), {
    recurringItemId: 7,
    plannedDate: "2026-09-01"
  });

  assert.equal(toTemplateWritePayload(template({ active: false }), "2026-09"), null);
  assert.equal(toTemplateWritePayload(template({ startsPeriod: "2026-10" }), "2026-09"), null);
  assert.equal(toTemplateWritePayload(template(), "2026-13"), null);

  for (const input of [null, undefined, 7, "plantilla", []]) {
    assert.equal(toTemplateWritePayload(input, "2026-09"), null, `entrada no-objeto: ${String(input)}`);
  }
});
