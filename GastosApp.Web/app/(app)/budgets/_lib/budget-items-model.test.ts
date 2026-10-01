import assert from "node:assert/strict";
import { test } from "node:test";
import type { BudgetItem } from "@/lib/contracts/budget-items";
import type { BudgetPeriodStatus } from "@/lib/contracts/budgets";
import {
  budgetItemKindBadgeClass,
  budgetItemKindLabel,
  budgetItemStatusBadgeClass,
  budgetItemStatusLabel,
  buildBudgetBreakdown,
  buildBudgetComposition,
  describePeriodClosure,
  filterItemsByKind,
  getItemActions,
  isClosedPeriod,
  isOpenPeriod
} from "./budget-items-model.ts";
import {
  createEmptyBudgetItemForm,
  isCategoryOnlyKind,
  MAX_BUDGET_ITEM_NAME_LENGTH,
  MAX_BUDGET_ITEM_NOTES_LENGTH,
  parseItemAmount,
  toBudgetItemFormValues,
  toBudgetItemWriteRequest,
  validateBudgetItemForm,
  type BudgetItemFormValues
} from "./budget-item-form-model.ts";

function budgetItem(overrides: Partial<BudgetItem> = {}): BudgetItem {
  return {
    itemId: 1,
    periodKey: "2026-09",
    kind: "expense",
    name: "Renta",
    plannedAmount: 1000,
    plannedDate: "2026-09-01T00:00:00",
    categoryId: 5,
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

function budgetStatus(overrides: Partial<BudgetPeriodStatus> = {}): BudgetPeriodStatus {
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

function form(overrides: Partial<BudgetItemFormValues> = {}): BudgetItemFormValues {
  return {
    kind: "expense",
    name: "Renta",
    plannedAmount: "1000",
    plannedDate: "2026-09-15",
    categoryId: 5,
    subcategoryId: null,
    accountId: null,
    merchantId: null,
    notes: "",
    ...overrides
  };
}

test("buildBudgetBreakdown mide el restante contra effective, no contra spent", () => {
  const breakdown = buildBudgetBreakdown({ amountMxn: 1000, spent: 400, committed: 250, projected: 100 });

  assert.deepEqual(breakdown, {
    amountMxn: 1000,
    spent: 400,
    committed: 250,
    // effective = spent + committed: el comprometido ya no está disponible.
    effective: 650,
    projected: 100,
    forecast: 750,
    remaining: 350
  });

  // Un presupuesto excedido reporta restante negativo en vez de recortarlo a cero.
  assert.equal(buildBudgetBreakdown({ amountMxn: 100, spent: 150, committed: 0, projected: 0 }).remaining, -50);
});

test("buildBudgetComposition separa el porcentaje mostrado del proyectado", () => {
  const composition = buildBudgetComposition({ amountMxn: 1000, spent: 600, committed: 150, projected: 300 });

  assert.equal(composition.spentPercent, 60);
  assert.equal(composition.committedPercent, 15);
  assert.equal(composition.projectedPercent, 30);
  assert.equal(composition.totalPercent, 75);
  assert.equal(composition.projectionPercent, 105);

  // Sobre-gasto: solo `effective` decide; la proyección no es dinero comprometido.
  const withoutProjection = buildBudgetComposition({ amountMxn: 1000, spent: 600, committed: 400, projected: 500 });
  assert.equal(withoutProjection.isOverBudget, false, "effective=1000 no excede el límite");
  assert.equal(withoutProjection.isForecastOverBudget, true, "forecast=1500 sí lo excede");

  // Sin límite no se fabrican porcentajes ni sobre-gasto.
  const noLimit = buildBudgetComposition({ amountMxn: 0, spent: 500, committed: 0, projected: 0 });
  assert.equal(noLimit.spentPercent, 0);
  assert.equal(noLimit.isOverBudget, true, "sin límite, cualquier gasto efectivo lo excede");
});

test("isOpenPeriod replica la comparación lexicográfica de yyyy-MM", () => {
  assert.equal(isOpenPeriod("2026-09", "2026-09"), true, "el mes en curso está abierto");
  assert.equal(isOpenPeriod("2026-10", "2026-09"), true);
  assert.equal(isOpenPeriod("2026-08", "2026-09"), false);
  // El relleno con ceros hace válida la comparación de cadenas: "2026-1" no debe pasar.
  assert.equal(isOpenPeriod("2026-1", "2026-09"), true, "comparación ordinal cruda, igual que el backend");

  assert.equal(isOpenPeriod("", "2026-09"), false);
  assert.equal(isOpenPeriod("  ", "2026-09"), false);
  assert.equal(isOpenPeriod("2026-09", ""), false);

  assert.equal(isClosedPeriod("2026-08", "2026-09"), true);
  assert.equal(isClosedPeriod("2026-09", "2026-09"), false);
});

test("describePeriodClosure decide por periodo, no por los ceros del estado", () => {
  // Un mes abierto sin partidas trae committed/projected en cero: indistinguible de uno cerrado.
  const open = describePeriodClosure(
    { periodKey: "2026-09", itemsPending: 0, itemsUnexecuted: 0 },
    "2026-09"
  );
  assert.equal(open.isClosed, false);
  assert.equal(open.hasPendingItems, false);

  const closed = describePeriodClosure(
    { periodKey: "2026-08", itemsPending: 0, itemsUnexecuted: 3 },
    "2026-09"
  );
  assert.equal(closed.isClosed, true);
  assert.equal(closed.unexecutedCount, 3, "en periodo cerrado itemsUnexecuted cuenta las pending caducadas");
  assert.equal(closed.hasPendingItems, false);

  const closedWithPending = describePeriodClosure(
    { periodKey: "2026-08", itemsPending: 2, itemsUnexecuted: 2 },
    "2026-09"
  );
  assert.equal(closedWithPending.hasPendingItems, true);
});

test("getItemActions no ofrece transiciones que el backend rechace", () => {
  // `executed` es terminal: cancelar o volver a pending devuelve 409.
  const executed = getItemActions("executed");
  assert.equal(executed.canEdit, false);
  assert.equal(executed.canChangeStatus, false);
  assert.equal(executed.canCancel, false);
  assert.deepEqual(executed.availableStatuses, []);
  assert.ok(executed.terminalReason);

  const cancelled = getItemActions("cancelled");
  assert.equal(cancelled.canEdit, false);
  assert.equal(cancelled.canCancel, false);
  assert.deepEqual(cancelled.availableStatuses, []);
  assert.ok(cancelled.terminalReason);

  // `pending` solo puede pasar a `ignored`: `executed` exige una transacción enlazada.
  const pending = getItemActions("pending");
  assert.equal(pending.canEdit, true);
  assert.equal(pending.canChangeStatus, true);
  assert.equal(pending.canCancel, true);
  assert.deepEqual(pending.availableStatuses, ["ignored"]);
  assert.equal(pending.terminalReason, null);
  assert.ok(!pending.availableStatuses.includes("executed"), "executed nunca es transición manual");

  const ignored = getItemActions("ignored");
  assert.equal(ignored.canEdit, true);
  assert.equal(ignored.canCancel, true);
  assert.deepEqual(ignored.availableStatuses, ["pending"]);
  assert.equal(ignored.terminalReason, null);

  // Estado desconocido: sin acciones inventadas y sin motivo, para no acusar un error falso.
  const unknown = getItemActions("no-existe");
  assert.equal(unknown.canEdit, false);
  assert.equal(unknown.canCancel, false);
  assert.deepEqual(unknown.availableStatuses, []);
  assert.equal(unknown.terminalReason, null);
});

test("filterItemsByKind filtra en el cliente y 'all' no recorta", () => {
  const items = [
    budgetItem({ itemId: 1, kind: "expense" }),
    budgetItem({ itemId: 2, kind: "income" }),
    budgetItem({ itemId: 3, kind: "expense" })
  ];

  assert.equal(filterItemsByKind(items, "all").length, 3);
  assert.deepEqual(filterItemsByKind(items, "expense").map((item) => item.itemId), [1, 3]);
  assert.deepEqual(filterItemsByKind(items, "income").map((item) => item.itemId), [2]);
  assert.equal(filterItemsByKind([], "expense").length, 0);
});

test("las etiquetas y badges cubren los cuatro estados sin mostrar el valor crudo", () => {
  assert.equal(budgetItemStatusLabel("pending"), "Pendiente");
  assert.equal(budgetItemStatusLabel("executed"), "Ejecutada");
  assert.equal(budgetItemStatusLabel("ignored"), "Ignorada");
  assert.equal(budgetItemStatusLabel("cancelled"), "Cancelada");
  assert.equal(budgetItemStatusLabel(""), "Sin estado");
  assert.equal(budgetItemStatusLabel("raro"), "raro", "un valor inesperado se muestra tal cual, no como vacío");

  assert.equal(budgetItemKindLabel("income"), "Ingreso");
  assert.equal(budgetItemKindLabel("expense"), "Gasto");
  assert.equal(budgetItemKindLabel(""), "Sin tipo");

  assert.equal(budgetItemStatusBadgeClass("executed"), "tabler-badge tabler-badge-solid tabler-badge-success");
  assert.equal(budgetItemStatusBadgeClass("pending"), "tabler-badge tabler-badge-solid tabler-badge-warning");
  assert.equal(budgetItemStatusBadgeClass("cancelled"), "tabler-badge tabler-badge-solid tabler-badge-danger");
  assert.equal(budgetItemStatusBadgeClass("desconocido"), "tabler-badge tabler-badge-solid tabler-badge-muted");
  assert.equal(budgetItemKindBadgeClass("income"), "tabler-badge tabler-badge-solid tabler-badge-success");
});

test("validateBudgetItemForm exige alcance XOR y un ingreso solo por categoría", () => {
  assert.deepEqual(validateBudgetItemForm(form()), {});

  assert.ok(validateBudgetItemForm(form({ name: "   " })).name);
  assert.ok(validateBudgetItemForm(form({ name: "x".repeat(MAX_BUDGET_ITEM_NAME_LENGTH + 1) })).name);
  assert.equal(validateBudgetItemForm(form({ name: "x".repeat(MAX_BUDGET_ITEM_NAME_LENGTH) })).name, undefined);

  for (const plannedAmount of ["", "0", "-5", "abc"]) {
    assert.ok(validateBudgetItemForm(form({ plannedAmount })).plannedAmount, `plannedAmount=${plannedAmount}`);
  }
  assert.equal(validateBudgetItemForm(form({ plannedAmount: "0.01" })).plannedAmount, undefined);

  for (const plannedDate of ["", "15/09/2026", "2026-9-15"]) {
    assert.ok(validateBudgetItemForm(form({ plannedDate })).plannedDate, `plannedDate=${plannedDate}`);
  }
  assert.equal(validateBudgetItemForm(form({ plannedDate: "2026-09-15" })).plannedDate, undefined);

  // XOR: exactamente uno de los dos alcances.
  assert.ok(validateBudgetItemForm(form({ categoryId: null, subcategoryId: null })).scope);
  assert.equal(validateBudgetItemForm(form({ categoryId: null, subcategoryId: 9 })).scope, undefined);
  assert.ok(validateBudgetItemForm(form({ categoryId: 5, subcategoryId: 9 })).scope, "no se aceptan ambos");

  // Un ingreso nunca se planifica por subcategoría.
  const incomeWithoutCategory = validateBudgetItemForm(form({ kind: "income", categoryId: null, subcategoryId: 9 }));
  assert.ok(incomeWithoutCategory.scope, "el ingreso exige categoría aunque traiga subcategoría");
  assert.equal(validateBudgetItemForm(form({ kind: "income", categoryId: 5, subcategoryId: null })).scope, undefined);

  // Un tipo inválido corta la validación antes de inventar más errores.
  const badKind = validateBudgetItemForm(form({ kind: "otro" }));
  assert.ok(badKind.scope);
  assert.equal(badKind.name, undefined);

  assert.ok(validateBudgetItemForm(form({ notes: "x".repeat(MAX_BUDGET_ITEM_NOTES_LENGTH + 1) })).notes);
  assert.equal(validateBudgetItemForm(form({ notes: "x".repeat(MAX_BUDGET_ITEM_NOTES_LENGTH) })).notes, undefined);
});

test("toBudgetItemWriteRequest no envía periodKey y respeta el XOR del alcance", () => {
  const payload = toBudgetItemWriteRequest(form());
  assert.equal("periodKey" in payload, false, "el periodo lo deriva el backend de plannedDate");
  assert.deepEqual(payload, {
    kind: "expense",
    name: "Renta",
    plannedAmount: 1000,
    plannedDate: "2026-09-15",
    categoryId: 5,
    subcategoryId: null,
    accountId: null,
    merchantId: null,
    notes: null
  });

  // Con subcategoría se limpia la categoría, aunque el formulario traiga las dos.
  const bySubcategory = toBudgetItemWriteRequest(form({ categoryId: null, subcategoryId: 9 }));
  assert.equal(bySubcategory.categoryId, null);
  assert.equal(bySubcategory.subcategoryId, 9);

  // Si el formulario trae ambas, gana la categoría: una subcategoría solo viaja sin categoría.
  const both = toBudgetItemWriteRequest(form({ categoryId: 5, subcategoryId: 9 }));
  assert.equal(both.categoryId, 5);
  assert.equal(both.subcategoryId, null);

  // Un ingreso descarta cualquier subcategoría residual y recorta texto.
  const income = toBudgetItemWriteRequest(form({ kind: "income", name: "  Sueldo  ", notes: "  nota  ", subcategoryId: 9, categoryId: 3 }));
  assert.equal(income.kind, "income");
  assert.equal(income.name, "Sueldo");
  assert.equal(income.notes, "nota");
  assert.equal(income.subcategoryId, null);
  assert.equal(income.categoryId, 3);

  // Las notas vacías viajan como null y el monto se redondea a 2 decimales.
  const blankNotes = toBudgetItemWriteRequest(form({ notes: "   ", plannedAmount: "100.456" }));
  assert.equal(blankNotes.notes, null);
  assert.equal(blankNotes.plannedAmount, 100.46);
});

test("createEmptyBudgetItemForm y toBudgetItemFormValues conservan la fecha sin corrimiento de zona", () => {
  const empty = createEmptyBudgetItemForm("2026-09-15");
  assert.equal(empty.kind, "expense");
  assert.equal(empty.plannedDate, "2026-09-15");
  assert.equal(empty.categoryId, null);
  assert.equal(empty.notes, "");

  // `planned_date` es DATE y llega como `yyyy-MM-ddT00:00:00`: se recorta el prefijo.
  const values = toBudgetItemFormValues(budgetItem({ plannedDate: "2026-09-01T00:00:00", notes: null, plannedAmount: 1000 }));
  assert.equal(values.plannedDate, "2026-09-01");
  assert.equal(values.notes, "", "una nota nula se edita como texto vacío, no como 'null'");
  assert.equal(values.plannedAmount, "1000");

  assert.equal(toBudgetItemFormValues(budgetItem({ plannedDate: null })).plannedDate, "");
  assert.equal(isCategoryOnlyKind("income"), true);
  assert.equal(isCategoryOnlyKind("expense"), false);
  assert.equal(parseItemAmount(" 1000 "), 1000);
  assert.equal(parseItemAmount("100.456"), 100.46);
  assert.equal(parseItemAmount(""), null);
  assert.equal(parseItemAmount("abc"), null);
});

test("budgetStatus factory produce estados válidos para las pruebas de consumo", () => {
  const state = budgetStatus({ committed: 100, itemsPending: 2 });

  assert.equal(state.active, true);
  assert.equal(state.committed, 100);
  assert.equal(state.itemsPending, 2);
  assert.equal(state.effective, 0, "effective es un campo reportado, la fábrica no lo deriva");
});
