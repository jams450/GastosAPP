import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { RecurringItem } from "../../../../lib/contracts/recurring-items.ts";
import { normalizeRecurringItemFromTransaction } from "../../../../lib/contracts/recurring-items.ts";
import {
  buildSchedulePrefill,
  canScheduleTransaction,
  isProposalUnchanged,
  mapProposalToForm,
  SCHEDULE_CONFLICT_COPY,
  SCHEDULE_NOT_NOW_COPY,
  SCHEDULE_UNAVAILABLE_TYPES,
  scheduleAmountLabel,
  scheduleDayLabel,
  scheduleKindLabel,
  scheduleRepeatCopy,
  subcategoryOptionsForScope,
  toScheduleWritePayload,
  validateScheduleForm,
  type ScheduleFormValues
} from "./transactions-schedule.ts";
import type { TransactionHistoryItem } from "./transactions-types.ts";

const expense: TransactionHistoryItem = {
  transactionId: 42,
  accountId: 2,
  accountName: "Ocho",
  categoryId: 3,
  subcategoryId: null,
  merchantId: 5,
  type: "expense",
  transferGroupId: null,
  amount: 1234.5,
  description: "Renta",
  transactionDate: "2026-09-12T12:00:00",
  tags: [],
  creditMonths: null,
  creditRemainingAmount: null,
  creditStatus: null,
  allocations: []
};

/** Propuesta del `dryRun`: el backend no la escribió, así que su id llega en 0. */
function proposal(overrides: Partial<RecurringItem> = {}): RecurringItem {
  return {
    recurringItemId: 0,
    kind: "expense",
    name: "Renta",
    amountMode: "fixed",
    amountMxn: 1234.5,
    dayOfMonth: 12,
    categoryId: 3,
    subcategoryId: null,
    accountId: 2,
    merchantId: 5,
    startsPeriod: "2026-10",
    endsPeriod: null,
    active: true,
    autoExecute: false,
    effectiveFrom: null,
    created: null,
    updated: null,
    ...overrides
  };
}

function form(overrides: Partial<ScheduleFormValues> = {}): ScheduleFormValues {
  return { ...mapProposalToForm(proposal()), ...overrides };
}

test("SCHEDULE_UNAVAILABLE_TYPES cubre los tipos que el backend rechaza", () => {
  assert.deepEqual([...SCHEDULE_UNAVAILABLE_TYPES], ["transfer", "opening_credit"]);
});

test("canScheduleTransaction acepta income y expense sin transferGroupId", () => {
  assert.equal(canScheduleTransaction(expense), true);
  assert.equal(canScheduleTransaction({ ...expense, type: "income" }), true);
});

test("canScheduleTransaction rechaza transfer y opening_credit", () => {
  assert.equal(canScheduleTransaction({ ...expense, type: "transfer" }), false);
  assert.equal(canScheduleTransaction({ ...expense, type: "opening_credit" }), false);
});

test("canScheduleTransaction rechaza una fila con transferGroupId aunque su tipo sea gasto", () => {
  assert.equal(canScheduleTransaction({ ...expense, transferGroupId: "b1f0-4c2a" }), false);
});

test("buildSchedulePrefill devuelve el id solo en los casos programables", () => {
  assert.deepEqual(buildSchedulePrefill(expense), { transactionId: 42 });
  assert.equal(buildSchedulePrefill({ ...expense, type: "transfer" }), null);
  assert.equal(buildSchedulePrefill({ ...expense, type: "opening_credit" }), null);
  assert.equal(buildSchedulePrefill({ ...expense, transferGroupId: "abc" }), null);
});

test("buildSchedulePrefill no serializa nada en la URL", () => {
  const prefill = buildSchedulePrefill(expense);

  // El diálogo no navega: el prefill es solo el id, sin kind, fecha ni query string.
  assert.deepEqual(Object.keys(prefill ?? {}), ["transactionId"]);
});

test("mapProposalToForm mapea la propuesta completa", () => {
  assert.deepEqual(mapProposalToForm(proposal()), {
    kind: "expense",
    name: "Renta",
    amountMode: "fixed",
    amountMxn: "1234.5",
    dayOfMonth: "12",
    accountId: 2,
    categoryId: 3,
    subcategoryId: null,
    merchantId: 5,
    startsPeriod: "2026-10"
  });
});

test("mapProposalToForm deja vacíos los valores omitidos, nunca 0", () => {
  const mapped = mapProposalToForm(
    proposal({ amountMxn: null, accountId: null, merchantId: null, categoryId: null, subcategoryId: null })
  );

  assert.equal(mapped.amountMxn, "");
  assert.equal(mapped.accountId, null);
  assert.equal(mapped.merchantId, null);
  assert.equal(mapped.categoryId, null);
  assert.equal(mapped.subcategoryId, null);
  for (const value of [mapped.accountId, mapped.merchantId, mapped.categoryId, mapped.subcategoryId]) {
    assert.notEqual(value, 0);
  }
});

test("mapProposalToForm no inventa un id cuando la propuesta trae uno ilegible", () => {
  // El contrato acepta cualquier entero en los ids opcionales, así que un `0` sucio puede llegar
  // desde el cuerpo: el formulario lo descarta en vez de ofrecer una categoría que no existe.
  const normalized = normalizeRecurringItemFromTransaction({
    dryRun: true,
    written: false,
    conflict: false,
    template: { ...proposal(), categoryId: 0, merchantId: -3, accountId: 0 }
  });
  const mapped = mapProposalToForm(normalized.template as RecurringItem);

  assert.equal(normalized.template?.recurringItemId, 0);
  assert.equal(mapped.categoryId, null);
  assert.equal(mapped.merchantId, null);
  assert.equal(mapped.accountId, null);
});

test("mapProposalToForm conserva el modo promedio sin monto", () => {
  const mapped = mapProposalToForm(proposal({ amountMode: "average", amountMxn: null }));

  assert.equal(mapped.amountMode, "average");
  assert.equal(mapped.amountMxn, "");
});

test("isProposalUnchanged es true sobre la propuesta sin tocar", () => {
  assert.equal(isProposalUnchanged(mapProposalToForm(proposal()), proposal()), true);
});

test("isProposalUnchanged tolera espacios que no cambian el valor", () => {
  const untouched = form({ name: "  Renta  ", amountMxn: "1234.50", startsPeriod: " 2026-10 " });

  assert.equal(isProposalUnchanged(untouched, proposal()), true);
});

test("isProposalUnchanged es false tras editar cualquier campo", () => {
  const base = proposal();

  assert.equal(isProposalUnchanged(form({ name: "Renta vieja" }), base), false);
  assert.equal(isProposalUnchanged(form({ amountMxn: "999" }), base), false);
  assert.equal(isProposalUnchanged(form({ amountMode: "average" }), base), false);
  assert.equal(isProposalUnchanged(form({ dayOfMonth: "13" }), base), false);
  assert.equal(isProposalUnchanged(form({ dayOfMonth: "" }), base), false);
  assert.equal(isProposalUnchanged(form({ accountId: 9 }), base), false);
  assert.equal(isProposalUnchanged(form({ categoryId: 9 }), base), false);
  assert.equal(isProposalUnchanged(form({ subcategoryId: 9 }), base), false);
  assert.equal(isProposalUnchanged(form({ merchantId: 9 }), base), false);
  assert.equal(isProposalUnchanged(form({ startsPeriod: "2026-11" }), base), false);
});

test("validateScheduleForm acepta la propuesta derivada sin cambios", () => {
  assert.deepEqual(validateScheduleForm(mapProposalToForm(proposal())), {});
});

test("validateScheduleForm exige nombre de 2 a 120 caracteres", () => {
  assert.equal(validateScheduleForm(form({ name: "" })).name, "Mínimo 2 caracteres");
  assert.equal(validateScheduleForm(form({ name: "R" })).name, "Mínimo 2 caracteres");
  assert.equal(validateScheduleForm(form({ name: "R".repeat(121) })).name, "Máximo 120 caracteres");
  assert.equal(validateScheduleForm(form({ name: "R".repeat(120) })).name, undefined);
});

test("validateScheduleForm solo admite los modos de monto del dominio", () => {
  assert.equal(validateScheduleForm(form({ amountMode: "otro" })).amountMode, "Selecciona un modo de monto");
  assert.equal(validateScheduleForm(form({ amountMode: "fixed" })).amountMode, undefined);
  assert.equal(validateScheduleForm(form({ amountMode: "average" })).amountMode, undefined);
});

test("validateScheduleForm exige monto mayor a 0 solo en modo fijo", () => {
  assert.equal(validateScheduleForm(form({ amountMxn: "" })).amountMxn, "Monto mayor a 0");
  assert.equal(validateScheduleForm(form({ amountMxn: "0" })).amountMxn, "Monto mayor a 0");
  assert.equal(validateScheduleForm(form({ amountMxn: "-5" })).amountMxn, "Monto mayor a 0");
  assert.equal(validateScheduleForm(form({ amountMxn: "abc" })).amountMxn, "Monto mayor a 0");
  // En promedio el backend deriva el importe del historial: un monto vacío es correcto.
  assert.equal(validateScheduleForm(form({ amountMode: "average", amountMxn: "" })).amountMxn, undefined);
});

test("validateScheduleForm exige un día entero entre 1 y 31", () => {
  assert.equal(validateScheduleForm(form({ dayOfMonth: "0" })).dayOfMonth, "Día entre 1 y 31");
  assert.equal(validateScheduleForm(form({ dayOfMonth: "32" })).dayOfMonth, "Día entre 1 y 31");
  assert.equal(validateScheduleForm(form({ dayOfMonth: "12.5" })).dayOfMonth, "Día entre 1 y 31");
  assert.equal(validateScheduleForm(form({ dayOfMonth: "" })).dayOfMonth, "Día entre 1 y 31");
  assert.equal(validateScheduleForm(form({ dayOfMonth: "31" })).dayOfMonth, undefined);
});

test("validateScheduleForm exige el periodo inicial en formato yyyy-MM", () => {
  assert.equal(validateScheduleForm(form({ startsPeriod: "2026-10" })).startsPeriod, undefined);
  assert.equal(validateScheduleForm(form({ startsPeriod: "" })).startsPeriod, "Periodo requerido (aaaa-mm)");
  assert.equal(validateScheduleForm(form({ startsPeriod: "2026-13" })).startsPeriod, "Periodo requerido (aaaa-mm)");
  assert.equal(validateScheduleForm(form({ startsPeriod: "2026-10-01" })).startsPeriod, "Periodo requerido (aaaa-mm)");
});

test("validateScheduleForm aplica el scope XOR: nunca ambos ids", () => {
  assert.equal(validateScheduleForm(form({ categoryId: 3, subcategoryId: 4 })).scope, "Elige categoría o subcategoría, no ambas");
  assert.equal(validateScheduleForm(form({ categoryId: null, subcategoryId: null })).scope, "Selecciona una categoría o una subcategoría");
  assert.equal(validateScheduleForm(form({ categoryId: 3, subcategoryId: null })).scope, undefined);
  assert.equal(validateScheduleForm(form({ categoryId: null, subcategoryId: 4 })).scope, undefined);
});

test("validateScheduleForm no admite subcategoría en un ingreso", () => {
  const income = form({ kind: "income", categoryId: null, subcategoryId: 4 });

  assert.equal(validateScheduleForm(income).scope, "Un ingreso no admite subcategoría");
  assert.equal(validateScheduleForm(form({ kind: "income", categoryId: 3 })).scope, undefined);
  assert.equal(validateScheduleForm(form({ kind: "income", categoryId: null, subcategoryId: null })).scope, "Selecciona una categoría de ingreso");
});

test("toScheduleWritePayload arma los 13 campos que espera el catálogo", () => {
  const payload = toScheduleWritePayload(form());

  assert.deepEqual(Object.keys(payload).sort(), [
    "accountId",
    "amountMode",
    "amountMxn",
    "autoExecute",
    "categoryId",
    "dayOfMonth",
    "effectiveFrom",
    "endsPeriod",
    "kind",
    "merchantId",
    "name",
    "startsPeriod",
    "subcategoryId"
  ]);
  assert.deepEqual(payload, {
    kind: "expense",
    name: "Renta",
    amountMode: "fixed",
    amountMxn: 1234.5,
    dayOfMonth: 12,
    categoryId: 3,
    subcategoryId: null,
    accountId: 2,
    merchantId: 5,
    startsPeriod: "2026-10",
    endsPeriod: null,
    autoExecute: false,
    effectiveFrom: null
  });
});

test("toScheduleWritePayload no manda active ni decides vigencia ni ejecución automática", () => {
  const payload = toScheduleWritePayload(form()) as Record<string, unknown>;

  assert.equal(Object.hasOwn(payload, "active"), false);
  assert.equal(payload.endsPeriod, null);
  assert.equal(payload.effectiveFrom, null);
  assert.equal(payload.autoExecute, false);
});

test("toScheduleWritePayload manda amountMxn null en modo promedio", () => {
  const payload = toScheduleWritePayload(form({ amountMode: "average", amountMxn: "500" }));

  assert.equal(payload.amountMode, "average");
  assert.equal(payload.amountMxn, null);
});

test("toScheduleWritePayload envía solo un id de alcance", () => {
  const bySubcategory = toScheduleWritePayload(form({ categoryId: null, subcategoryId: 4 }));
  assert.equal(bySubcategory.categoryId, null);
  assert.equal(bySubcategory.subcategoryId, 4);

  // Con ambos marcados, la categoría manda: es el mismo criterio del drawer del catálogo.
  const both = toScheduleWritePayload(form({ categoryId: 3, subcategoryId: 4 }));
  assert.equal(both.categoryId, 3);
  assert.equal(both.subcategoryId, null);

  const income = toScheduleWritePayload(form({ kind: "income", subcategoryId: 4 }));
  assert.equal(income.kind, "income");
  assert.equal(income.subcategoryId, null);
});

test("toScheduleWritePayload normaliza nombre, periodo e importe antes de enviar", () => {
  const payload = toScheduleWritePayload(form({ name: "  Renta  ", startsPeriod: " 2026-10 ", amountMxn: "1234.567" }));

  assert.equal(payload.name, "Renta");
  assert.equal(payload.startsPeriod, "2026-10");
  assert.equal(payload.amountMxn, 1234.57);
});

test("la copia del resumen dice que se repetirá cada mes desde el periodo inicial", () => {
  const copy = scheduleRepeatCopy("Renta", "2026-10", 12);

  assert.match(copy, /se repetirá cada mes/);
  assert.match(copy, /2026-10/);
  assert.match(copy, /día 12/);
  assert.match(SCHEDULE_NOT_NOW_COPY, /no captura nada ahora/);
});

test("la copia sobrevive a un periodo o un día ilegibles sin inventar valores", () => {
  const copy = scheduleRepeatCopy("Renta", "", "");

  assert.match(copy, /se repetirá cada mes/);
  assert.doesNotMatch(copy, /desde el periodo/);
  assert.doesNotMatch(copy, /día 0/);
});

test("las etiquetas de presentación usan el mismo español que el catálogo", () => {
  assert.equal(scheduleKindLabel("expense"), "Gasto");
  assert.equal(scheduleKindLabel("income"), "Ingreso");
  assert.equal(scheduleAmountLabel(1234.5, "fixed"), "$1,234.50");
  assert.equal(scheduleAmountLabel(1234.5, "average"), "—");
  assert.equal(scheduleAmountLabel(null, "fixed"), "—");
  assert.equal(scheduleDayLabel(12), "Día 12 de cada mes");
  assert.equal(scheduleDayLabel("12"), "Día 12 de cada mes");
  assert.equal(scheduleDayLabel(""), "—");
  assert.equal(scheduleDayLabel(0), "—");
});

test("normalizeRecurringItemFromTransaction no fabrica una propuesta ausente", () => {
  assert.deepEqual(normalizeRecurringItemFromTransaction({}), {
    dryRun: false,
    written: false,
    conflict: false,
    template: null,
    existing: null
  });
  assert.deepEqual(normalizeRecurringItemFromTransaction(null), {
    dryRun: false,
    written: false,
    conflict: false,
    template: null,
    existing: null
  });
});

test("normalizeRecurringItemFromTransaction conserva la propuesta del dryRun con id 0", () => {
  const result = normalizeRecurringItemFromTransaction({
    dryRun: true,
    written: false,
    conflict: false,
    template: proposal(),
    // El dryRun también avisa si el nombre ya está ocupado, sin marcar conflicto.
    existing: { ...proposal(), recurringItemId: 8 }
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.written, false);
  assert.equal(result.conflict, false);
  assert.equal(result.template?.recurringItemId, 0);
  assert.equal(result.template?.startsPeriod, "2026-10");
  assert.equal(result.existing?.recurringItemId, 8);
});

test("subcategoryOptionsForScope conserva la lista al elegir subcategoría (el alcance se limpia, la referencia no)", () => {
  // Regresión: si las opciones se acotaran por `form.categoryId`, elegir una subcategoría (que por
  // ser XOR limpia la categoría) vaciaría la propia lista y la opción elegida desaparecería.
  const subcategories = [
    { subcategoryId: 11, categoryId: 3 },
    { subcategoryId: 12, categoryId: 3 },
    { subcategoryId: 13, categoryId: 4 }
  ];

  const withScope = subcategoryOptionsForScope(subcategories, 3, "expense");
  assert.deepEqual(
    withScope.map((subcategory) => subcategory.subcategoryId),
    [11, 12]
  );

  // Con la categoría del formulario ya limpia (`null`) la lista sigue viva mientras la referencia
  // apunte a la categoría de la subcategoría elegida.
  const chosen = withScope.find((subcategory) => subcategory.subcategoryId === 11);
  assert.ok(chosen);
  assert.deepEqual(
    subcategoryOptionsForScope(subcategories, chosen.categoryId, "expense").map((subcategory) => subcategory.subcategoryId),
    [11, 12]
  );
});

test("subcategoryOptionsForScope no ofrece subcategorías a un ingreso ni sin categoría de referencia", () => {
  const subcategories = [{ subcategoryId: 11, categoryId: 3 }];

  assert.deepEqual(subcategoryOptionsForScope(subcategories, 3, "income"), []);
  assert.deepEqual(subcategoryOptionsForScope(subcategories, null, "expense"), []);
  assert.deepEqual(subcategoryOptionsForScope([], 3, "expense"), []);
});

test("SCHEDULE_CONFLICT_COPY no afirma que la plantilla existente esté activa", () => {
  // La clave única del backend es `(kind, name)` y no incluye `active`: el choque también ocurre con
  // una plantilla desactivada, así que el texto no puede prometer que está activa.
  assert.doesNotMatch(SCHEDULE_CONFLICT_COPY, /activa/i);
  assert.match(SCHEDULE_CONFLICT_COPY, /Ya existe una plantilla/);
});

test("el diálogo no reintroduce la promesa de 'activa' en su propio texto de colisión", () => {
  // Regresión: el respaldo del 409 vivía duplicado dentro del diálogo y afirmaba que la plantilla
  // existente estaba "activa". El copy tiene que salir del modelo, que es lo único que la prueba
  // anterior puede vigilar, así que aquí se vigila el propio diálogo.
  const source = readFileSync(
    new URL("../_components/history/schedule-recurring-dialog.tsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /plantilla\s+activa/i);
});
