import assert from "node:assert/strict";
import { test } from "node:test";
import type { RecurringItem } from "@/lib/contracts/recurring-items";
import {
  categoryTypeForKind,
  clampDayOfMonth,
  createEmptyRecurringItemForm,
  currentMonthStartDate,
  currentPeriodKey,
  daysInPeriod,
  formatRecurringItemAmount,
  formatRecurringItemValidity,
  isAverageAmountMode,
  isCategoryOnlyKind,
  isDateValue,
  isPeriodKey,
  MAX_DAY_OF_MONTH,
  MAX_RECURRING_ITEM_NAME_LENGTH,
  MIN_DAY_OF_MONTH,
  parseAmountMxn,
  parseDayOfMonth,
  recurringItemAmountModeLabel,
  recurringItemKindLabel,
  resolveAccountLabel,
  resolveScopeLabel,
  supportsAutoExecute,
  toRecurringItemFormValues,
  toRecurringItemWriteRequest,
  validateRecurringItemForm,
  type RecurringItemFormValues
} from "./recurring-items-model.ts";
import {
  normalizeRecurringItem,
  normalizeRecurringItemConfig,
  normalizeRecurringItems,
  validateRecurringItemPayload
} from "../../../../../lib/contracts/recurring-items.ts";

const TODAY = new Date(2026, 9, 1); // 2026-10-01, medianoche local

function recurringItem(overrides: Partial<RecurringItem> = {}): RecurringItem {
  return {
    recurringItemId: 1,
    kind: "expense",
    name: "Renta",
    amountMode: "fixed",
    amountMxn: 12000,
    dayOfMonth: 5,
    categoryId: 3,
    subcategoryId: null,
    accountId: 1,
    merchantId: null,
    startsPeriod: "2026-10",
    endsPeriod: null,
    active: true,
    autoExecute: false,
    effectiveFrom: null,
    created: "2026-09-20T10:00:00",
    updated: null,
    ...overrides
  };
}

function formValues(overrides: Partial<RecurringItemFormValues> = {}): RecurringItemFormValues {
  return {
    ...createEmptyRecurringItemForm(TODAY),
    name: "Renta",
    amountMxn: "12000",
    dayOfMonth: "5",
    categoryId: 3,
    ...overrides
  };
}

test("createEmptyRecurringItemForm arranca en el mes actual con gasto y monto fijo", () => {
  const values = createEmptyRecurringItemForm(TODAY);

  assert.equal(values.kind, "expense");
  assert.equal(values.amountMode, "fixed");
  assert.equal(values.startsPeriod, "2026-10");
  assert.equal(values.id, null);
  assert.equal(values.autoExecute, false);
  assert.equal(values.endsPeriod, "");
  assert.equal(values.effectiveFrom, "");
});

test("currentPeriodKey deriva el mes de la fecha local, no del UTC (TZ=America/Mexico_City)", () => {
  // 2026-10-31 23:30 en hora negativa (CDMX) todavía es octubre en local, pero en UTC ya es
  // noviembre: la derivación debe usar los accesores locales. El script `test` fija
  // TZ=America/Mexico_City; sin ese pin el caso no distingue una implementación basada en
  // `toISOString()`, por eso se verifica la premisa antes de la aserción.
  const localLateNight = new Date(2026, 9, 31, 23, 30);
  assert.notEqual(
    localLateNight.getMonth(),
    localLateNight.getUTCMonth(),
    "el pin TZ=America/Mexico_City ya no está activo: el caso dejó de discriminar"
  );
  assert.equal(currentPeriodKey(localLateNight), "2026-10");
  assert.equal(currentMonthStartDate(localLateNight), "2026-10-01");
});

test("currentPeriodKey rellena el mes con cero a la izquierda", () => {
  assert.equal(currentPeriodKey(new Date(2026, 0, 15)), "2026-01");
});

test("parseAmountMxn redondea a dos decimales y rechaza texto no numérico", () => {
  assert.equal(parseAmountMxn("1234.567"), 1234.57);
  assert.equal(parseAmountMxn(" 900 "), 900);
  assert.equal(parseAmountMxn(""), null);
  assert.equal(parseAmountMxn("abc"), null);
});

test("parseDayOfMonth solo acepta enteros", () => {
  assert.equal(parseDayOfMonth("31"), 31);
  assert.equal(parseDayOfMonth(" 7 "), 7);
  assert.equal(parseDayOfMonth("7.5"), null);
  assert.equal(parseDayOfMonth(""), null);
  assert.equal(parseDayOfMonth("siete"), null);
});

test("daysInPeriod resuelve el largo real de cada mes", () => {
  assert.equal(daysInPeriod("2026-02"), 28);
  assert.equal(daysInPeriod("2024-02"), 29);
  assert.equal(daysInPeriod("2026-04"), 30);
  assert.equal(daysInPeriod("2026-12"), 31);
  assert.equal(daysInPeriod("2026-13"), null);
  assert.equal(daysInPeriod("basura"), null);
});

test("clampDayOfMonth recorta al último día sin rechazar 29/30/31", () => {
  assert.equal(clampDayOfMonth(31, "2026-02"), 28);
  assert.equal(clampDayOfMonth(31, "2024-02"), 29);
  assert.equal(clampDayOfMonth(30, "2026-04"), 30);
  assert.equal(clampDayOfMonth(31, "2026-01"), 31);
  assert.equal(clampDayOfMonth(0, "2026-01"), 1);
  assert.equal(clampDayOfMonth(31, "2026-13"), null);
});

test("los días 29, 30 y 31 son válidos en el formulario aunque el mes no los tenga", () => {
  for (const day of ["29", "30", "31"]) {
    const errors = validateRecurringItemForm(formValues({ dayOfMonth: day }), TODAY);
    assert.equal(errors.dayOfMonth, undefined, `el día ${day} no debe bloquearse`);
  }
});

test("isPeriodKey e isDateValue validan los formatos esperados", () => {
  assert.equal(isPeriodKey("2026-10"), true);
  assert.equal(isPeriodKey("2026-13"), false);
  assert.equal(isPeriodKey("2026-1"), false);
  assert.equal(isDateValue("2026-10-01"), true);
  assert.equal(isDateValue("2026-10"), false);
});

test("el alcance es XOR: exactamente uno de categoría o subcategoría", () => {
  assert.deepEqual(validateRecurringItemForm(formValues(), TODAY), {});

  const none = validateRecurringItemForm(formValues({ categoryId: null }), TODAY);
  assert.equal(none.scope, "Selecciona una categoría o una subcategoría");

  const both = validateRecurringItemForm(formValues({ subcategoryId: 8 }), TODAY);
  assert.equal(both.scope, "Elige categoría o subcategoría, no ambas");
});

test("un ingreso exige categoría y nunca admite subcategoría", () => {
  assert.equal(isCategoryOnlyKind("income"), true);
  assert.equal(isCategoryOnlyKind("expense"), false);

  const missing = validateRecurringItemForm(formValues({ kind: "income", categoryId: null }), TODAY);
  assert.equal(missing.scope, "Selecciona una categoría de ingreso");

  // Aunque el estado traiga una subcategoría residual, el ingreso no la admite.
  const residual = validateRecurringItemForm(formValues({ kind: "income", categoryId: 2, subcategoryId: 8 }), TODAY);
  assert.equal(residual.scope, "Un ingreso no admite subcategoría");
});

test("categoryTypeForKind limita el catálogo de categorías al tipo de la partida", () => {
  assert.equal(categoryTypeForKind("income"), "income");
  assert.equal(categoryTypeForKind("expense"), "expense");
  assert.equal(categoryTypeForKind("otro"), "expense");
});

test("el modo fijo exige monto mayor a 0", () => {
  assert.equal(validateRecurringItemForm(formValues({ amountMxn: "0" }), TODAY).amountMxn, "Monto mayor a 0");
  assert.equal(validateRecurringItemForm(formValues({ amountMxn: "-5" }), TODAY).amountMxn, "Monto mayor a 0");
  assert.equal(validateRecurringItemForm(formValues({ amountMxn: "" }), TODAY).amountMxn, "Monto mayor a 0");
  assert.equal(validateRecurringItemForm(formValues({ amountMxn: "0", amountMode: "average" }), TODAY).amountMxn, undefined);
});

test("el modo promedio oculta el monto y lo envía como null", () => {
  assert.equal(isAverageAmountMode("average"), true);
  assert.equal(isAverageAmountMode("fixed"), false);

  const payload = toRecurringItemWriteRequest(formValues({ amountMode: "average", amountMxn: "12000" }));
  assert.equal(payload.amountMode, "average");
  assert.equal(payload.amountMxn, null);
});

test("el día del mes debe ser un entero entre 1 y 31", () => {
  assert.equal(validateRecurringItemForm(formValues({ dayOfMonth: "0" }), TODAY).dayOfMonth, `Día entre ${MIN_DAY_OF_MONTH} y ${MAX_DAY_OF_MONTH}`);
  assert.equal(validateRecurringItemForm(formValues({ dayOfMonth: "32" }), TODAY).dayOfMonth, `Día entre ${MIN_DAY_OF_MONTH} y ${MAX_DAY_OF_MONTH}`);
  assert.equal(validateRecurringItemForm(formValues({ dayOfMonth: "3.5" }), TODAY).dayOfMonth, `Día entre ${MIN_DAY_OF_MONTH} y ${MAX_DAY_OF_MONTH}`);
  assert.equal(validateRecurringItemForm(formValues({ dayOfMonth: "" }), TODAY).dayOfMonth, `Día entre ${MIN_DAY_OF_MONTH} y ${MAX_DAY_OF_MONTH}`);
});

test("startsPeriod es obligatorio y no puede ser anterior al mes actual", () => {
  assert.equal(validateRecurringItemForm(formValues({ startsPeriod: "" }), TODAY).startsPeriod, "Periodo requerido (aaaa-mm)");
  assert.equal(
    validateRecurringItemForm(formValues({ startsPeriod: "2026-09" }), TODAY).startsPeriod,
    "El periodo inicial no puede ser anterior al mes actual"
  );
  assert.equal(validateRecurringItemForm(formValues({ startsPeriod: "2026-10" }), TODAY).startsPeriod, undefined);
  assert.equal(validateRecurringItemForm(formValues({ startsPeriod: "2027-01" }), TODAY).startsPeriod, undefined);
});

test("endsPeriod es opcional pero no puede anteceder al periodo inicial", () => {
  assert.equal(validateRecurringItemForm(formValues({ endsPeriod: "" }), TODAY).endsPeriod, undefined);
  assert.equal(validateRecurringItemForm(formValues({ endsPeriod: "2026-12" }), TODAY).endsPeriod, undefined);
  assert.equal(
    validateRecurringItemForm(formValues({ endsPeriod: "2026-09" }), TODAY).endsPeriod,
    "El periodo final no puede ser anterior al inicial"
  );
  assert.equal(validateRecurringItemForm(formValues({ endsPeriod: "2026-1" }), TODAY).endsPeriod, "Periodo inválido (aaaa-mm)");
});

test("effectiveFrom es opcional y nunca anterior al primer día del mes actual", () => {
  assert.equal(validateRecurringItemForm(formValues({ effectiveFrom: "" }), TODAY).effectiveFrom, undefined);
  assert.equal(validateRecurringItemForm(formValues({ effectiveFrom: "2026-10-01" }), TODAY).effectiveFrom, undefined);
  assert.equal(validateRecurringItemForm(formValues({ effectiveFrom: "2026-10-15" }), TODAY).effectiveFrom, undefined);
  assert.equal(
    validateRecurringItemForm(formValues({ effectiveFrom: "2026-09-30" }), TODAY).effectiveFrom,
    "La fecha efectiva no puede ser anterior al primer día del mes actual"
  );
  assert.equal(validateRecurringItemForm(formValues({ effectiveFrom: "ayer" }), TODAY).effectiveFrom, "Fecha inválida (aaaa-mm-dd)");
});

test("el nombre tiene largo mínimo y máximo", () => {
  assert.equal(validateRecurringItemForm(formValues({ name: "" }), TODAY).name, "Nombre requerido");
  assert.equal(validateRecurringItemForm(formValues({ name: "  " }), TODAY).name, "Nombre requerido");
  assert.equal(validateRecurringItemForm(formValues({ name: "R" }), TODAY).name, "Mínimo 2 caracteres");
  assert.equal(
    validateRecurringItemForm(formValues({ name: "R".repeat(MAX_RECURRING_ITEM_NAME_LENGTH + 1) }), TODAY).name,
    `Máximo ${MAX_RECURRING_ITEM_NAME_LENGTH} caracteres`
  );
});

test("un tipo desconocido corta la validación antes de evaluar el resto", () => {
  assert.equal(validateRecurringItemForm(formValues({ kind: "transfer" }), TODAY).name, "Selecciona un tipo de partida");
});

test("autoExecute solo existe para gasto y viaja en false para ingreso", () => {
  assert.equal(supportsAutoExecute("expense"), true);
  assert.equal(supportsAutoExecute("income"), false);

  const expense = toRecurringItemWriteRequest(formValues({ kind: "expense", autoExecute: true }));
  assert.equal(expense.autoExecute, true);

  const income = toRecurringItemWriteRequest(formValues({ kind: "income", categoryId: 2, autoExecute: true }));
  assert.equal(income.autoExecute, false);
});

test("toRecurringItemWriteRequest aplica el XOR de alcance al cuerpo", () => {
  const withSubcategory = toRecurringItemWriteRequest(formValues({ categoryId: null, subcategoryId: 8 }));
  assert.equal(withSubcategory.categoryId, null);
  assert.equal(withSubcategory.subcategoryId, 8);

  const withCategory = toRecurringItemWriteRequest(formValues({ categoryId: 3, subcategoryId: 8 }));
  assert.equal(withCategory.categoryId, 3);
  assert.equal(withCategory.subcategoryId, null);
});

test("toRecurringItemWriteRequest normaliza periodos, monto y fecha efectiva", () => {
  const payload = toRecurringItemWriteRequest(
    formValues({
      name: "  Renta mensual  ",
      amountMxn: "12000.005",
      dayOfMonth: " 5 ",
      startsPeriod: " 2026-11 ",
      endsPeriod: "2027-03",
      effectiveFrom: " 2026-10-15 "
    })
  );

  assert.equal(payload.name, "Renta mensual");
  assert.equal(payload.amountMxn, 12000.01);
  assert.equal(payload.dayOfMonth, 5);
  assert.equal(payload.startsPeriod, "2026-11");
  assert.equal(payload.endsPeriod, "2027-03");
  assert.equal(payload.effectiveFrom, "2026-10-15");
});

test("toRecurringItemWriteRequest manda null en los opcionales vacíos", () => {
  const payload = toRecurringItemWriteRequest(
    formValues({ endsPeriod: "", effectiveFrom: "", accountId: null, merchantId: null })
  );

  assert.equal(payload.endsPeriod, null);
  assert.equal(payload.effectiveFrom, null);
  assert.equal(payload.accountId, null);
  assert.equal(payload.merchantId, null);
});

test("el cuerpo de escritura nunca incluye active", () => {
  const payload = toRecurringItemWriteRequest(formValues()) as Record<string, unknown>;
  assert.equal("active" in payload, false);
});

test("toRecurringItemFormValues deja el monto vacío y normaliza la fecha efectiva", () => {
  const values = toRecurringItemFormValues(
    recurringItem({ amountMxn: null, amountMode: "average", effectiveFrom: "2026-10-15T00:00:00", endsPeriod: "2027-01" })
  );

  assert.equal(values.id, 1);
  assert.equal(values.amountMxn, "");
  assert.equal(values.amountMode, "average");
  assert.equal(values.effectiveFrom, "2026-10-15");
  assert.equal(values.endsPeriod, "2027-01");
});

test("toRecurringItemFormValues normaliza la fecha efectiva nula a cadena vacía", () => {
  const values = toRecurringItemFormValues(recurringItem({ effectiveFrom: null }));
  assert.equal(values.effectiveFrom, "");
});

test("un ingreso editado nunca llega con autoExecute activo", () => {
  const values = toRecurringItemFormValues(recurringItem({ kind: "income", autoExecute: true }));
  assert.equal(values.autoExecute, false);
});

test("las etiquetas de tipo y modo son legibles en español", () => {
  assert.equal(recurringItemKindLabel("expense"), "Gasto");
  assert.equal(recurringItemKindLabel("income"), "Ingreso");
  assert.equal(recurringItemKindLabel("otro"), "otro");
  assert.equal(recurringItemAmountModeLabel("fixed"), "Fijo");
  assert.equal(recurringItemAmountModeLabel("average"), "Promedio");
});

test("el monto se formatea como moneda y se muestra como guion en modo promedio", () => {
  assert.match(formatRecurringItemAmount(12000, "fixed"), /12,000/);
  assert.equal(formatRecurringItemAmount(null, "fixed"), "—");
  assert.equal(formatRecurringItemAmount(12000, "average"), "—");
});

test("la vigencia muestra el flechado solo cuando hay periodo final", () => {
  assert.equal(formatRecurringItemValidity("2026-10", null), "2026-10");
  assert.equal(formatRecurringItemValidity("2026-10", "2027-03"), "2026-10 → 2027-03");
});

test("los nombres de cuenta y alcance caen al id cuando el catálogo no los trae", () => {
  const accounts = [{ accountId: 1, name: "Oaxaca" }];
  assert.equal(resolveAccountLabel(1, accounts), "Oaxaca");
  assert.equal(resolveAccountLabel(9, accounts), "#9");
  assert.equal(resolveAccountLabel(null, accounts), "—");

  const categories = [{ categoryId: 3, name: "Renta" }];
  const subcategories = [{ subcategoryId: 8, name: "Deptos" }];
  assert.equal(resolveScopeLabel(3, null, categories, subcategories), "Renta");
  assert.equal(resolveScopeLabel(null, 8, categories, subcategories), "Deptos");
  assert.equal(resolveScopeLabel(7, null, categories, subcategories), "#7");
  assert.equal(resolveScopeLabel(null, 12, categories, subcategories), "Subcategoría: #12");
  assert.equal(resolveScopeLabel(null, null, categories, subcategories), "—");
});

test("normalizeRecurringItem tolera propiedades nulas omitidas y no inventa ceros", () => {
  const item = normalizeRecurringItem({
    recurringItemId: 4,
    kind: "expense",
    name: "Internet",
    amountMode: "average",
    dayOfMonth: 12,
    startsPeriod: "2026-10",
    active: true,
    autoExecute: true
  });

  assert.ok(item);
  assert.equal(item.amountMxn, null);
  assert.equal(item.endsPeriod, null);
  assert.equal(item.effectiveFrom, null);
  assert.equal(item.categoryId, null);
  assert.equal(item.subcategoryId, null);
  assert.equal(item.accountId, null);
  assert.equal(item.merchantId, null);
  assert.equal(item.created, null);
  assert.equal(item.updated, null);
});

test("normalizeRecurringItem no convierte valores no numéricos en 0 ni en 1", () => {
  // Regresión: `Number(false)` es 0 y `Number(true)` es 1; un monto o un id inventado es peor
  // que un `null`, porque la columna mostraría un importe falso.
  const malformed = normalizeRecurringItem({
    recurringItemId: 5,
    kind: "expense",
    name: "Renta",
    amountMode: "fixed",
    amountMxn: false,
    dayOfMonth: 12,
    categoryId: true,
    subcategoryId: [],
    accountId: {},
    merchantId: "   ",
    startsPeriod: "2026-10",
    active: true,
    autoExecute: false
  });

  assert.ok(malformed);
  assert.equal(malformed.amountMxn, null);
  assert.equal(malformed.categoryId, null);
  assert.equal(malformed.subcategoryId, null);
  assert.equal(malformed.accountId, null);
  assert.equal(malformed.merchantId, null);
});

test("normalizeRecurringItem descarta una fila sin día válido en vez de mostrar el día 0", () => {
  assert.equal(
    normalizeRecurringItem({
      recurringItemId: 6,
      kind: "expense",
      name: "Renta",
      amountMode: "fixed",
      dayOfMonth: "   ",
      startsPeriod: "2026-10",
      active: true,
      autoExecute: false
    }),
    null
  );
});

test("normalizeRecurringItem descarta filas sin id o sin día del mes", () => {
  assert.equal(normalizeRecurringItem({ name: "Sin id", dayOfMonth: 1 }), null);
  assert.equal(normalizeRecurringItem({ recurringItemId: 0, dayOfMonth: 1 }), null);
  assert.equal(normalizeRecurringItem({ recurringItemId: 2, name: "Sin día" }), null);
  const coerced = normalizeRecurringItem({ recurringItemId: 2, dayOfMonth: "5" });
  assert.equal(coerced?.dayOfMonth, 5);
  assert.equal(normalizeRecurringItem(null), null);
});

test("normalizeRecurringItems devuelve lista vacía ante una respuesta no lista", () => {
  assert.deepEqual(normalizeRecurringItems(null), []);
  assert.deepEqual(normalizeRecurringItems({ items: [] }), []);
  assert.equal(normalizeRecurringItems([{ recurringItemId: 1, dayOfMonth: 1 }]).length, 1);
});

test("normalizeRecurringItemConfig no habilita la ejecución automática sin confirmation", () => {
  assert.deepEqual(normalizeRecurringItemConfig({ autoExecuteAvailable: true }), { autoExecuteAvailable: true, reason: null });
  assert.deepEqual(normalizeRecurringItemConfig({ autoExecuteAvailable: false, reason: "Sin Telegram" }), {
    autoExecuteAvailable: false,
    reason: "Sin Telegram"
  });
  assert.deepEqual(normalizeRecurringItemConfig(null), { autoExecuteAvailable: false, reason: null });
});

test("validateRecurringItemPayload acepta el cuerpo completo de alta", () => {
  const result = validateRecurringItemPayload({
    kind: "expense",
    name: "Renta",
    amountMode: "fixed",
    amountMxn: 12000,
    dayOfMonth: 5,
    categoryId: 3,
    accountId: 1,
    startsPeriod: "2026-10",
    endsPeriod: "2027-03",
    autoExecute: true,
    effectiveFrom: "2026-10-15T00:00:00"
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.amountMxn, 12000);
    assert.equal(result.data.effectiveFrom, "2026-10-15");
    assert.equal(result.data.subcategoryId, null);
    assert.equal("active" in (result.data as Record<string, unknown>), false);
  }
});

test("validateRecurringItemPayload fuerza autoExecute en false para ingreso", () => {
  const result = validateRecurringItemPayload({
    kind: "income",
    name: "Sueldo",
    amountMode: "fixed",
    amountMxn: 30000,
    dayOfMonth: 15,
    categoryId: 2,
    startsPeriod: "2026-10",
    autoExecute: true
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.autoExecute, false);
  }
});

test("validateRecurringItemPayload rechaza kind, monto, día, alcance y periodo inválidos", () => {
  const base = {
    kind: "expense",
    name: "Renta",
    amountMode: "fixed",
    amountMxn: 12000,
    dayOfMonth: 5,
    categoryId: 3,
    startsPeriod: "2026-10"
  };

  assert.equal(validateRecurringItemPayload(null).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, kind: "transfer" }).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, amountMode: "otro" }).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, amountMxn: 0 }).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, amountMxn: null }).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, dayOfMonth: 0 }).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, dayOfMonth: 32 }).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, categoryId: null, subcategoryId: null }).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, subcategoryId: 8 }).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, startsPeriod: "2026-13" }).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, startsPeriod: "" }).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, endsPeriod: "2026-09" }).ok, false);
  assert.equal(validateRecurringItemPayload({ ...base, name: "R" }).ok, false);
});

test("validateRecurringItemPayload rechaza subcategoría en un ingreso y conserva laRIXOR", () => {
  const income = validateRecurringItemPayload({
    kind: "income",
    name: "Sueldo",
    amountMode: "fixed",
    amountMxn: 30000,
    dayOfMonth: 15,
    categoryId: null,
    subcategoryId: 8,
    startsPeriod: "2026-10"
  });
  assert.equal(income.ok, false);

  const expense = validateRecurringItemPayload({
    kind: "expense",
    name: "Internet",
    amountMode: "fixed",
    amountMxn: 600,
    dayOfMonth: 12,
    categoryId: null,
    subcategoryId: 8,
    startsPeriod: "2026-10"
  });
  assert.equal(expense.ok, true);
  if (expense.ok) {
    assert.equal(expense.data.categoryId, null);
    assert.equal(expense.data.subcategoryId, 8);
  }
});

test("validateRecurringItemPayload anula el monto en modo promedio", () => {
  const result = validateRecurringItemPayload({
    kind: "expense",
    name: "Internet",
    amountMode: "average",
    amountMxn: 600,
    dayOfMonth: 12,
    categoryId: 3,
    startsPeriod: "2026-10"
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.amountMxn, null);
  }
});
