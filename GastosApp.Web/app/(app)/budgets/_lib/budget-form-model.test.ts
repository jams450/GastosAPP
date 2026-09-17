import assert from "node:assert/strict";
import { test } from "node:test";
import type { BudgetThreshold } from "@/lib/contracts/budgets";
import {
  createEmptyBudgetForm,
  MAX_BUDGET_THRESHOLDS,
  MAX_THRESHOLD_NAME_LENGTH,
  parseFormNumber,
  thresholdsChanged,
  toBudgetCreatePayload,
  toBudgetUpdatePayload,
  toThresholdPayload,
  validateBudgetForm,
  type BudgetFormValues,
  type BudgetThresholdFormValue
} from "./budget-form-model.ts";

function thresholdRow(overrides: Partial<Omit<BudgetThresholdFormValue, "key">> = {}): BudgetThresholdFormValue {
  return { key: `row-${Math.random()}`, name: "Aviso", percent: "80", active: true, ...overrides };
}

function validForm(overrides: Partial<BudgetFormValues> = {}): BudgetFormValues {
  return {
    name: "Comida",
    scopeType: "category",
    categoryId: 7,
    subcategoryId: null,
    amountMxn: "10000",
    thresholds: [thresholdRow()],
    ...overrides
  };
}

test("validateBudgetForm rejects missing/oversized name, non-positive amount and missing scope", () => {
  assert.equal(validateBudgetForm(validForm()).name, undefined);

  assert.ok(validateBudgetForm(validForm({ name: "   " })).name);
  assert.ok(validateBudgetForm(validForm({ name: "x".repeat(121) })).name);
  assert.equal(validateBudgetForm(validForm({ name: "x".repeat(120) })).name, undefined);

  for (const amountMxn of ["", "0", "-1", "abc"]) {
    assert.ok(validateBudgetForm(validForm({ amountMxn })).amountMxn, `amountMxn=${amountMxn} debe ser inválido`);
  }

  // XOR: el alcance seleccionado manda, y el tipo contrario se ignora por completo.
  assert.ok(validateBudgetForm(validForm({ scopeType: "category", categoryId: null })).scope);
  assert.equal(validateBudgetForm(validForm({ scopeType: "subcategory", categoryId: null, subcategoryId: 3 })).scope, undefined);
  assert.ok(validateBudgetForm(validForm({ scopeType: "subcategory", subcategoryId: null })).scope);
});

test("validateBudgetForm enforces threshold count, percent bounds, duplicates and name length", () => {
  const valid = validForm().thresholds;
  assert.equal(validateBudgetForm(validForm({ thresholds: valid })).thresholds, undefined);

  assert.ok(validateBudgetForm(validForm({ thresholds: [] })).thresholds);

  const tooMany = Array.from({ length: MAX_BUDGET_THRESHOLDS + 1 }, (_, index) =>
    thresholdRow({ percent: String(index + 1) })
  );
  assert.ok(validateBudgetForm(validForm({ thresholds: tooMany })).thresholds);

  for (const percent of ["", "0", "-5", "1000", "1000.01"]) {
    assert.ok(
      validateBudgetForm(validForm({ thresholds: [thresholdRow({ percent })] })).thresholds,
      `percent=${percent} debe ser inválido`
    );
  }
  assert.equal(validateBudgetForm(validForm({ thresholds: [thresholdRow({ percent: "999.99" })] })).thresholds, undefined);

  const duplicated = [thresholdRow({ percent: "80" }), thresholdRow({ percent: "80.00" })];
  assert.ok(validateBudgetForm(validForm({ thresholds: duplicated })).thresholds);

  assert.ok(validateBudgetForm(validForm({ thresholds: [thresholdRow({ name: "  " })] })).thresholds);

  const longName = "x".repeat(MAX_THRESHOLD_NAME_LENGTH + 1);
  assert.ok(validateBudgetForm(validForm({ thresholds: [thresholdRow({ name: longName })] })).thresholds);
  assert.equal(
    validateBudgetForm(validForm({ thresholds: [thresholdRow({ name: "x".repeat(MAX_THRESHOLD_NAME_LENGTH) })] })).thresholds,
    undefined
  );
});

test("createEmptyBudgetForm mirrors the API defaults (80/100, active, sin alcance)", () => {
  const form = createEmptyBudgetForm();

  assert.equal(form.name, "");
  assert.equal(form.scopeType, "category");
  assert.equal(form.categoryId, null);
  assert.equal(form.subcategoryId, null);
  assert.deepEqual(
    form.thresholds.map((row) => ({ name: row.name, percent: row.percent, active: row.active })),
    [
      { name: "Aviso", percent: "80", active: true },
      { name: "Límite", percent: "100", active: true }
    ]
  );
});

test("payloads send exactly one scope id and normalize thresholds by percent", () => {
  const createByCategory = toBudgetCreatePayload(validForm({ subcategoryId: null }), "2026-09");
  assert.deepEqual(createByCategory, {
    periodKey: "2026-09",
    name: "Comida",
    categoryId: 7,
    subcategoryId: null,
    amountMxn: 10000,
    active: true,
    thresholds: [{ name: "Aviso", percent: 80, active: true }]
  });

  const createBySubcategory = toBudgetCreatePayload(
    validForm({ scopeType: "subcategory", categoryId: null, subcategoryId: 9 }),
    "2026-09"
  );
  assert.equal(createBySubcategory.categoryId, null);
  assert.equal(createBySubcategory.subcategoryId, 9);

  // El API no acepta periodKey en PUT y no debe cambiar el alcance a medias.
  const update = toBudgetUpdatePayload(validForm({ scopeType: "category", subcategoryId: 9 }), false);
  assert.deepEqual(update, {
    name: "Comida",
    categoryId: 7,
    subcategoryId: null,
    amountMxn: 10000,
    active: false
  });

  const unordered = [thresholdRow({ name: " Límite ", percent: "100" }), thresholdRow({ name: "Aviso", percent: "80", active: false })];
  assert.deepEqual(toThresholdPayload(validForm({ thresholds: unordered })), [
    { name: "Aviso", percent: 80, active: false },
    { name: "Límite", percent: 100, active: true }
  ]);
});

test("thresholdsChanged ignora el orden y detecta cambios reales", () => {
  const original: BudgetThreshold[] = [
    { thresholdId: 1, name: "Aviso", percent: 80, active: true },
    { thresholdId: 2, name: "Límite", percent: 100, active: true }
  ];

  const same = validForm({
    thresholds: [thresholdRow({ name: " Límite ", percent: "100", active: true }), thresholdRow({ name: "Aviso", percent: "80", active: true })]
  });
  assert.equal(thresholdsChanged(original, same), false);

  assert.equal(thresholdsChanged(original, validForm({ thresholds: [thresholdRow({ percent: "85" })] })), true);
  assert.equal(
    thresholdsChanged(original, validForm({ thresholds: [thresholdRow({ name: "Aviso", percent: "80", active: false })] })),
    true
  );
});

test("parseFormNumber redondea a 2 decimales y descarta entradas inválidas", () => {
  assert.equal(parseFormNumber(" 10000 "), 10000);
  assert.equal(parseFormNumber("100.456"), 100.46);
  assert.equal(parseFormNumber("100.444"), 100.44);
  assert.equal(parseFormNumber(""), null);
  assert.equal(parseFormNumber("abc"), null);
});
