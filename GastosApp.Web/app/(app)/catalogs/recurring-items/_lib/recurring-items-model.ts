// `recurring-items-model.ts` se prueba con `node --experimental-strip-types --test`, que no
// resuelve el alias `@/`. Todos los imports de valor van con ruta relativa y extensión explícita
// (precedente: `budget-item-form-model.ts`); `@/` queda solo para tipos.
import {
  isRecurringItemAmountMode,
  isRecurringItemKind,
  toRecurringItemDateInputValue,
  type RecurringItem,
  type RecurringItemKind,
  type RecurringItemWriteRequest
} from "../../../../../lib/contracts/recurring-items.ts";

/** `recurring_items.name` es `VARCHAR(120)`: se valida aquí, no solo en el API. */
export const MAX_RECURRING_ITEM_NAME_LENGTH = 120;
export const MIN_RECURRING_ITEM_NAME_LENGTH = 2;

export const MIN_DAY_OF_MONTH = 1;
export const MAX_DAY_OF_MONTH = 31;

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type RecurringItemFormValues = {
  id: number | null;
  kind: string;
  name: string;
  amountMode: string;
  amountMxn: string;
  dayOfMonth: string;
  categoryId: number | null;
  subcategoryId: number | null;
  accountId: number | null;
  merchantId: number | null;
  startsPeriod: string;
  endsPeriod: string;
  autoExecute: boolean;
  effectiveFrom: string;
};

export type RecurringItemFormErrors = Partial<
  Record<"name" | "amountMxn" | "dayOfMonth" | "scope" | "startsPeriod" | "endsPeriod" | "effectiveFrom", string>
>;

/** `null` cuando el texto no es un número válido; los importes se redondean a 2 decimales. */
export function parseAmountMxn(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

/** `null` cuando el texto no es un entero válido; el día siempre es un entero 1..31. */
export function parseDayOfMonth(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

export function isPeriodKey(value: string): boolean {
  return PERIOD_PATTERN.test(value.trim());
}

export function isDateValue(value: string): boolean {
  return DATE_PATTERN.test(value.trim());
}

/**
 * Periodo `yyyy-MM` del mes en curso, derivado de la fecha del navegador.
 *
 * El backend razona en `America/Mexico_City`, así que el "mes actual" de la UI es el mes local del
 * cliente: derivarlo aquí (y no de `toISOString()`, que corre en UTC) evita que de madrugada el
 * formulario rechace por un día el periodo que el servidor sí aceptaría.
 */
export function currentPeriodKey(today: Date): string {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Primer día del periodo en curso (`yyyy-MM-01`): el piso de `effectiveFrom`. */
export function currentMonthStartDate(today: Date): string {
  return `${currentPeriodKey(today)}-01`;
}

/** Días del mes de un periodo `yyyy-MM`; devuelve `null` si el periodo no es válido. */
export function daysInPeriod(period: string): number | null {
  if (!isPeriodKey(period)) {
    return null;
  }

  const [year, month] = period.trim().split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

/**
 * Último día válido de la ocurrencia dentro de un periodo. El backend ya aplica este mismo ajuste,
 * así que 29/30/31 nunca se bloquean en el formulario: el recorte es solo de presentación.
 */
export function clampDayOfMonth(dayOfMonth: number, period: string): number | null {
  const days = daysInPeriod(period);
  if (days === null || !Number.isInteger(dayOfMonth)) {
    return null;
  }

  return Math.min(Math.max(dayOfMonth, MIN_DAY_OF_MONTH), days);
}

/** El alta nace en el mes en curso: es el único periodo que el backend no acepta como pasado. */
export function createEmptyRecurringItemForm(today: Date): RecurringItemFormValues {
  return {
    id: null,
    kind: "expense",
    name: "",
    amountMode: "fixed",
    amountMxn: "",
    dayOfMonth: "1",
    categoryId: null,
    subcategoryId: null,
    accountId: null,
    merchantId: null,
    startsPeriod: currentPeriodKey(today),
    endsPeriod: "",
    autoExecute: false,
    effectiveFrom: ""
  };
}

export function toRecurringItemFormValues(item: RecurringItem): RecurringItemFormValues {
  return {
    id: item.recurringItemId,
    kind: item.kind,
    name: item.name,
    amountMode: item.amountMode,
    amountMxn: item.amountMxn === null ? "" : String(item.amountMxn),
    dayOfMonth: String(item.dayOfMonth),
    categoryId: item.categoryId,
    subcategoryId: item.subcategoryId,
    accountId: item.accountId,
    merchantId: item.merchantId,
    startsPeriod: item.startsPeriod,
    endsPeriod: item.endsPeriod ?? "",
    // El ingreso nunca ejecuta: se muestra el dato sin checkbox y se envía siempre en false.
    autoExecute: item.kind === "expense" && item.autoExecute,
    effectiveFrom: toRecurringItemDateInputValue(item.effectiveFrom)
  };
}

/** Modo de alcance del formulario: el ingreso nunca ofrece subcategoría. */
export function isCategoryOnlyKind(kind: string): boolean {
  return kind === "income";
}

/** El ingreso no ejecuta nunca, así que el checkbox solo existe para el gasto. */
export function supportsAutoExecute(kind: string): boolean {
  return kind === "expense";
}

/** En modo promedio el monto lo deriva el backend del historial: el campo se oculta. */
export function isAverageAmountMode(amountMode: string): boolean {
  return amountMode === "average";
}

/** Opciones de categoría según el tipo: gasto e ingreso nunca comparten catálogo. */
export function categoryTypeForKind(kind: string): "income" | "expense" {
  return isCategoryOnlyKind(kind) ? "income" : "expense";
}

export function validateRecurringItemForm(
  values: RecurringItemFormValues,
  today: Date
): RecurringItemFormErrors {
  const errors: RecurringItemFormErrors = {};

  if (!isRecurringItemKind(values.kind)) {
    errors.name = "Selecciona un tipo de partida";
    return errors;
  }

  const name = values.name.trim();
  if (!name) {
    errors.name = "Nombre requerido";
  } else if (name.length < MIN_RECURRING_ITEM_NAME_LENGTH) {
    errors.name = `Mínimo ${MIN_RECURRING_ITEM_NAME_LENGTH} caracteres`;
  } else if (name.length > MAX_RECURRING_ITEM_NAME_LENGTH) {
    errors.name = `Máximo ${MAX_RECURRING_ITEM_NAME_LENGTH} caracteres`;
  }

  // En modo promedio no se pide monto: el backend lo promedia desde el historial.
  if (!isAverageAmountMode(values.amountMode)) {
    if (!isRecurringItemAmountMode(values.amountMode)) {
      errors.amountMxn = "Selecciona un modo de monto";
    } else {
      const amountMxn = parseAmountMxn(values.amountMxn);
      if (amountMxn === null || amountMxn <= 0) {
        errors.amountMxn = "Monto mayor a 0";
      }
    }
  }

  // 29/30/31 no se bloquean: el backend ajusta al último día del mes que no los tiene.
  const dayOfMonth = parseDayOfMonth(values.dayOfMonth);
  if (dayOfMonth === null || dayOfMonth < MIN_DAY_OF_MONTH || dayOfMonth > MAX_DAY_OF_MONTH) {
    errors.dayOfMonth = `Día entre ${MIN_DAY_OF_MONTH} y ${MAX_DAY_OF_MONTH}`;
  }

  const period = currentPeriodKey(today);
  if (!isPeriodKey(values.startsPeriod)) {
    errors.startsPeriod = "Periodo requerido (aaaa-mm)";
  } else if (values.startsPeriod.trim() < period) {
    errors.startsPeriod = "El periodo inicial no puede ser anterior al mes actual";
  }

  const endsPeriod = values.endsPeriod.trim();
  if (endsPeriod.length > 0) {
    if (!isPeriodKey(endsPeriod)) {
      errors.endsPeriod = "Periodo inválido (aaaa-mm)";
    } else if (isPeriodKey(values.startsPeriod) && endsPeriod < values.startsPeriod.trim()) {
      errors.endsPeriod = "El periodo final no puede ser anterior al inicial";
    }
  }

  // `effectiveFrom` gobierna solo el primer periodo, así que su piso es el día 1 del mes en curso.
  const effectiveFrom = values.effectiveFrom.trim();
  if (effectiveFrom.length > 0) {
    if (!isDateValue(effectiveFrom)) {
      errors.effectiveFrom = "Fecha inválida (aaaa-mm-dd)";
    } else if (effectiveFrom < currentMonthStartDate(today)) {
      errors.effectiveFrom = "La fecha efectiva no puede ser anterior al primer día del mes actual";
    }
  }

  // Scope XOR: exactamente uno de categoría o subcategoría, y un ingreso no admite subcategoría.
  if (isCategoryOnlyKind(values.kind)) {
    if (values.subcategoryId !== null) {
      errors.scope = "Un ingreso no admite subcategoría";
    } else if (values.categoryId === null) {
      errors.scope = "Selecciona una categoría de ingreso";
    }
  } else if (values.categoryId === null && values.subcategoryId === null) {
    errors.scope = "Selecciona una categoría o una subcategoría";
  } else if (values.categoryId !== null && values.subcategoryId !== null) {
    errors.scope = "Elige categoría o subcategoría, no ambas";
  }

  return errors;
}

/**
 * Cuerpo de alta/edición. El conjunto de campos es el mismo en ambos casos: `kind` se reenvía
 * siempre porque el API lo exige, aunque la UI lo bloquea al editar.
 */
export function toRecurringItemWriteRequest(values: RecurringItemFormValues): RecurringItemWriteRequest {
  const isIncome = isCategoryOnlyKind(values.kind);
  const useSubcategory = !isIncome && values.subcategoryId !== null && values.categoryId === null;
  const isAverage = isAverageAmountMode(values.amountMode);
  const endsPeriod = values.endsPeriod.trim();

  return {
    kind: values.kind as RecurringItemKind,
    name: values.name.trim(),
    amountMode: isAverage ? "average" : "fixed",
    // El modo promedio nunca viaja con monto: lo resuelve el backend.
    amountMxn: isAverage ? null : parseAmountMxn(values.amountMxn),
    dayOfMonth: parseDayOfMonth(values.dayOfMonth) ?? 0,
    categoryId: useSubcategory ? null : values.categoryId,
    subcategoryId: useSubcategory ? values.subcategoryId : null,
    accountId: values.accountId,
    merchantId: values.merchantId,
    startsPeriod: values.startsPeriod.trim(),
    endsPeriod: isPeriodKey(endsPeriod) ? endsPeriod : null,
    autoExecute: supportsAutoExecute(values.kind) && values.autoExecute,
    effectiveFrom: isDateValue(values.effectiveFrom.trim()) ? values.effectiveFrom.trim() : null
  };
}

export function recurringItemKindLabel(kind: string): string {
  if (kind === "expense") {
    return "Gasto";
  }

  if (kind === "income") {
    return "Ingreso";
  }

  return kind;
}

export function recurringItemAmountModeLabel(amountMode: string): string {
  return isAverageAmountMode(amountMode) ? "Promedio" : "Fijo";
}

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN"
});

/** `—` cuando no hay monto: en modo promedio el importe real todavía no existe. */
export function formatRecurringItemAmount(amountMxn: number | null, amountMode: string): string {
  if (isAverageAmountMode(amountMode) || amountMxn === null) {
    return "—";
  }

  return currencyFormatter.format(amountMxn);
}

export function formatRecurringItemValidity(startsPeriod: string, endsPeriod: string | null): string {
  if (!endsPeriod) {
    return startsPeriod;
  }

  return `${startsPeriod} → ${endsPeriod}`;
}

/** Nombre de cuenta con respaldo al id: el catálogo puede no incluir una cuenta inactiva. */
export function resolveAccountLabel(accountId: number | null, accounts: { accountId: number; name: string }[]): string {
  if (accountId === null) {
    return "—";
  }

  return accounts.find((account) => account.accountId === accountId)?.name ?? `#${accountId}`;
}

/** Categoría o subcategoría del alcance XOR, con el respaldo al id cuando el catálogo no la trae. */
export function resolveScopeLabel(
  categoryId: number | null,
  subcategoryId: number | null,
  categories: { categoryId: number; name: string }[],
  subcategories: { subcategoryId: number; name: string }[]
): string {
  if (categoryId !== null) {
    return categories.find((category) => category.categoryId === categoryId)?.name ?? `#${categoryId}`;
  }

  if (subcategoryId !== null) {
    const name = subcategories.find((subcategory) => subcategory.subcategoryId === subcategoryId)?.name;
    return name ?? `Subcategoría: #${subcategoryId}`;
  }

  return "—";
}
