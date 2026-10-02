import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBudgetItemSuggestion, normalizeBudgetItemSuggestions } from "./budget-items.ts";

/** Payload tal como lo emite `GET /api/budget-items/suggestions`: array plano, `int?` ausentes. */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    itemId: 12,
    periodKey: "2026-09",
    kind: "expense",
    name: "Renta",
    plannedAmount: 4500.5,
    plannedDate: "2026-09-01T00:00:00",
    categoryId: 5,
    subcategoryId: 9,
    accountId: 3,
    merchantId: 7,
    transactionId: 88,
    transactionAmount: 4400,
    transactionDate: "2026-09-03T18:40:00",
    distanceDays: 2,
    strength: "weak",
    ...overrides
  };
}

test("normalizeBudgetItemSuggestion conserva el par completo", () => {
  assert.deepEqual(normalizeBudgetItemSuggestion(payload()), {
    itemId: 12,
    periodKey: "2026-09",
    kind: "expense",
    name: "Renta",
    plannedAmount: 4500.5,
    plannedDate: "2026-09-01T00:00:00",
    categoryId: 5,
    subcategoryId: 9,
    accountId: 3,
    merchantId: 7,
    transactionId: 88,
    transactionAmount: 4400,
    transactionDate: "2026-09-03T18:40:00",
    distanceDays: 2,
    strength: "weak"
  });
});

test("normalizeBudgetItemSuggestion tolera los int? ausentes (undefined, no null)", () => {
  // `WhenWritingNull` hace que los `int?` nulos ni siquiera aparezcan en el JSON.
  const suggestion = normalizeBudgetItemSuggestion(payload({ categoryId: undefined, subcategoryId: undefined, accountId: undefined, merchantId: undefined }));

  assert.ok(suggestion);
  assert.equal(suggestion.categoryId, null);
  assert.equal(suggestion.subcategoryId, null);
  assert.equal(suggestion.accountId, null);
  assert.equal(suggestion.merchantId, null);
  // Lo que sí es obligatorio sigue siendo número, nunca `null` ni `0` inventado.
  assert.equal(suggestion.itemId, 12);
  assert.equal(suggestion.transactionId, 88);

  // Un `null` explícito o un vacío se tratan igual que la ausencia.
  const explicitNull = normalizeBudgetItemSuggestion(payload({ categoryId: null, subcategoryId: "" }));
  assert.equal(explicitNull?.categoryId, null);
  assert.equal(explicitNull?.subcategoryId, null);
});

test("normalizeBudgetItemSuggestion rechaza lo que no se puede mostrar como par", () => {
  for (const input of [null, undefined, 42, "weak", []]) {
    assert.equal(normalizeBudgetItemSuggestion(input), null, `entrada no-objeto: ${String(input)}`);
  }

  // Sin identidad de partida o de transacción el par no se puede comparar: se descarta la fila en
  // vez de inventar un enlace que el backend nunca propuso.
  assert.equal(normalizeBudgetItemSuggestion(payload({ itemId: undefined }))?.itemId ?? null, null);
  assert.equal(normalizeBudgetItemSuggestion(payload({ itemId: 0 })), null);
  assert.equal(normalizeBudgetItemSuggestion(payload({ transactionId: undefined })), null);
  assert.equal(normalizeBudgetItemSuggestion(payload({ transactionId: 0 })), null);
});

test("normalizeBudgetItemSuggestion no inventa valores ausentes y sanea la distancia", () => {
  const suggestion = normalizeBudgetItemSuggestion(payload({ plannedDate: "  ", transactionDate: undefined, distanceDays: -4, strength: undefined, kind: undefined, name: "   " }));

  assert.ok(suggestion);
  assert.equal(suggestion.plannedDate, null);
  assert.equal(suggestion.transactionDate, null);
  // Una distancia negativa no es una distancia: se acota a cero días, no a "mismo día" por azar.
  assert.equal(suggestion.distanceDays, 0);
  assert.equal(suggestion.strength, "weak", "la fuerza ausente toma la única que emite el backend");
  assert.equal(suggestion.kind, "", "sin tipo inventado: lo etiqueta la UI como 'Sin tipo'");
  assert.equal(suggestion.name, "Sin nombre");

  // Una fuerza inesperada se conserva en crudo: no se disfraza de débil ni de fuerte.
  assert.equal(normalizeBudgetItemSuggestion(payload({ strength: "strong" }))?.strength, "strong");
  // Los importes llegan como texto en algunos Responses y se normalizan a número.
  assert.equal(normalizeBudgetItemSuggestion(payload({ plannedAmount: "1500.75", transactionAmount: "1500" }))?.plannedAmount, 1500.75);
  assert.equal(normalizeBudgetItemSuggestion(payload({ plannedAmount: "abc" }))?.plannedAmount, 0);
});

test("normalizeBudgetItemSuggestions acepta el array plano y filtra lo inservible", () => {
  const rows = normalizeBudgetItemSuggestions([
    payload({ itemId: 1, transactionId: 10 }),
    payload({ itemId: 2, transactionId: 20 }),
    payload({ itemId: undefined }),
    null,
    "no-objeto"
  ]);

  assert.deepEqual(rows.map((row) => row.itemId), [1, 2]);
  assert.deepEqual(rows.map((row) => row.transactionId), [10, 20]);
});

test("normalizeBudgetItemSuggestions devuelve lista vacía si no llega un array", () => {
  for (const input of [null, undefined, {}, "sugerencias", 7]) {
    assert.deepEqual(normalizeBudgetItemSuggestions(input), [], `entrada no-array: ${String(input)}`);
  }
});