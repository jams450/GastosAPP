import assert from "node:assert/strict";
import { test } from "node:test";
import type { BudgetItemSuggestion } from "@/lib/contracts/budget-items";
import {
  describeSuggestionContext,
  describeSuggestionScope,
  formatPlannedDateLabel,
  formatTransactionDateLabel,
  sortBudgetItemSuggestions,
  suggestionDistanceLabel,
  suggestionKindBadgeClass,
  suggestionKindLabel,
  suggestionRowKey,
  suggestionStrengthBadgeClass,
  suggestionStrengthLabel,
  type SuggestionCatalogs
} from "./budget-suggestions-model.ts";

function suggestion(overrides: Partial<BudgetItemSuggestion> = {}): BudgetItemSuggestion {
  return {
    itemId: 1,
    periodKey: "2026-09",
    kind: "expense",
    name: "Renta",
    plannedAmount: 4500,
    plannedDate: "2026-09-01T00:00:00",
    categoryId: 5,
    subcategoryId: null,
    accountId: null,
    merchantId: null,
    transactionId: 88,
    transactionAmount: 4400,
    transactionDate: "2026-09-03T18:40:00",
    distanceDays: 2,
    strength: "weak",
    ...overrides
  };
}

const catalogs: SuggestionCatalogs = {
  categoryById: new Map([[5, { categoryId: 5, name: "Hogar" }]]),
  subcategoryById: new Map([[9, { subcategoryId: 9, categoryId: 5, name: "Renta" }]]),
  accountById: new Map([[3, { accountId: 3, name: "Orochex" }]]),
  merchantById: new Map([[7, { merchantId: 7, name: "Inmobiliaria" }]])
};

test("sortBudgetItemSuggestions ordena por fecha planeada, luego cercanía y luego id", () => {
  const ordered = sortBudgetItemSuggestions([
    suggestion({ itemId: 30, plannedDate: "2026-09-20T00:00:00", distanceDays: 0 }),
    suggestion({ itemId: 10, plannedDate: "2026-09-05T00:00:00", distanceDays: 4 }),
    suggestion({ itemId: 20, plannedDate: "2026-09-05T00:00:00", distanceDays: 1 }),
    suggestion({ itemId: 5, plannedDate: null })
  ]);

  // Misma fecha: gana la distancia más corta y, a igualdad de distancia, el id más bajo.
  assert.deepEqual(ordered.map((row) => row.itemId), [20, 10, 30, 5]);
  // Sin fecha la sugerencia va al final en vez de ganar el orden por tener "".
  assert.equal(ordered[ordered.length - 1].plannedDate, null);

  // No muta la entrada: el orden es de presentación, el contrato queda intacto.
  const original = [suggestion({ itemId: 2 }), suggestion({ itemId: 1 })];
  const sorted = sortBudgetItemSuggestions(original);
  assert.deepEqual(original.map((row) => row.itemId), [2, 1]);
  assert.deepEqual(sorted.map((row) => row.itemId), [1, 2]);
  assert.deepEqual(sortBudgetItemSuggestions([]), []);
});

test("describeSuggestionScope resuelve subcategoría, categoría y sin alcance", () => {
  assert.deepEqual(describeSuggestionScope(suggestion({ subcategoryId: 9 }), catalogs), {
    label: "Renta",
    hint: "Hogar"
  });

  assert.deepEqual(describeSuggestionScope(suggestion({ categoryId: 5 }), catalogs), {
    label: "Hogar",
    hint: "Categoría"
  });

  assert.deepEqual(describeSuggestionScope(suggestion({ categoryId: null }), catalogs), {
    label: "Sin alcance",
    hint: null
  });

  // Catálogo ausente o sin esa fila: se muestra el id en vez de un nombre inventado.
  assert.deepEqual(describeSuggestionScope(suggestion({ subcategoryId: 404 }), catalogs), {
    label: "Subcategoría #404",
    hint: "Subcategoría"
  });
  assert.deepEqual(describeSuggestionScope(suggestion({ categoryId: 404 }), catalogs), {
    label: "Categoría #404",
    hint: "Categoría"
  });
});

test("describeSuggestionContext resuelve cuenta y comercio, y omite lo que no viene", () => {
  assert.deepEqual(describeSuggestionContext(suggestion({ accountId: 3, merchantId: 7 }), catalogs), {
    account: "Orochex",
    merchant: "Inmobiliaria"
  });

  assert.deepEqual(describeSuggestionContext(suggestion({ accountId: null, merchantId: null }), catalogs), {
    account: null,
    merchant: null
  });

  // Con id pero sin catálogo: `null` (la fila dirá "sin cuenta"), no un id crudo.
  assert.deepEqual(describeSuggestionContext(suggestion({ accountId: 404, merchantId: 404 }), catalogs), {
    account: null,
    merchant: null
  });
});

test("las etiquetas de fuerza y tipo no dependen del color para explicarse", () => {
  assert.equal(suggestionStrengthLabel("weak"), "Coincidencia débil");
  assert.equal(suggestionStrengthLabel(""), "Sin fuerza definida");
  assert.equal(suggestionStrengthLabel("strong"), "strong", "una fuerza inesperada se muestra tal cual");
  assert.equal(suggestionStrengthBadgeClass("weak"), "tabler-badge tabler-badge-solid tabler-badge-warning");
  assert.equal(suggestionStrengthBadgeClass("lo-que-sea"), "tabler-badge tabler-badge-solid tabler-badge-muted");

  assert.equal(suggestionKindLabel("income"), "Ingreso");
  assert.equal(suggestionKindLabel("expense"), "Gasto");
  assert.equal(suggestionKindLabel(""), "Sin tipo");
  assert.equal(suggestionKindBadgeClass("income"), "tabler-badge tabler-badge-solid tabler-badge-success");
});

test("suggestionDistanceLabel acota y concuerda en singular/plural", () => {
  assert.equal(suggestionDistanceLabel(0), "Mismo día");
  assert.equal(suggestionDistanceLabel(1), "1 día de distancia");
  assert.equal(suggestionDistanceLabel(7), "7 días de distancia");
  // Un valor sucio o negativo no produce "0 días de distancia" ni un negativo en pantalla.
  assert.equal(suggestionDistanceLabel(-3), "Mismo día");
  assert.equal(suggestionDistanceLabel(Number.NaN), "Mismo día");
});

test("las fechas se formatean sin correr el día", () => {
  // `planned_date` es DATE: se recorta el prefijo y se lee en UTC.
  assert.equal(formatPlannedDateLabel("2026-09-01T00:00:00"), "1 sep 2026");
  assert.equal(formatPlannedDateLabel("2026-09-01"), "1 sep 2026");
  assert.equal(formatPlannedDateLabel(null), "—");
  assert.equal(formatPlannedDateLabel(""), "—");

  // La fecha de la transacción trae hora: se muestra, sin pasarla por UTC. La etiqueta sale en
  // formato de 12 horas, así que 18:40 se lee "6:40"; leerla como UTC correría a "12:40".
  const transactionLabel = formatTransactionDateLabel("2026-09-03T18:40:00");
  assert.match(transactionLabel, /^3 sep 2026,/);
  assert.ok(transactionLabel.includes("6:40"), `la hora local se conserva: ${transactionLabel}`);
  assert.equal(formatTransactionDateLabel(null), "—");
  assert.equal(formatTransactionDateLabel("no-es-fecha"), "—");
});

test("suggestionRowKey distingue el par, no solo la partida", () => {
  assert.equal(suggestionRowKey(suggestion({ itemId: 12, transactionId: 88 })), "12:88");
  // Dos transacciones candidatas de la misma partida son filas distintas.
  assert.notEqual(suggestionRowKey(suggestion({ itemId: 12, transactionId: 88 })), suggestionRowKey(suggestion({ itemId: 12, transactionId: 89 })));
});