// `transactions-schedule.ts` se prueba con `node --experimental-strip-types --test`, que no resuelve
// el alias `@/`: los imports de valor van con ruta relativa y extensión explícita (mismo precedente que
// `catalogs/recurring-items/_lib/recurring-items-model.ts`). `@/` queda solo para tipos.
//
// Lógica pura del diálogo "Programar" del histórico. No hay React ni `fetch` aquí: la derivación
// (día local, mes siguiente, rechazos) vive en el backend y este módulo solo traduce la propuesta a
// estado de formulario, lo valida en español y arma el cuerpo de escritura.
import {
  isRecurringItemAmountMode,
  type RecurringItem,
  type RecurringItemKind,
  type RecurringItemWriteRequest
} from "../../../../lib/contracts/recurring-items.ts";
import {
  formatRecurringItemAmount,
  isPeriodKey,
  MAX_DAY_OF_MONTH,
  MAX_RECURRING_ITEM_NAME_LENGTH,
  MIN_DAY_OF_MONTH,
  MIN_RECURRING_ITEM_NAME_LENGTH,
  parseAmountMxn,
  parseDayOfMonth,
  recurringItemKindLabel
} from "../../catalogs/recurring-items/_lib/recurring-items-model.ts";
import type { HistoryTransactionType, TransactionHistoryItem } from "./transactions-types.ts";

/**
 * Tipos que el backend rechaza con 400 (sección 8.7). Un movimiento ya emparejado por
 * `transferGroupId` tampoco es programable aunque su tipo sea `income`/`expense`: la otra mitad del
 * par falta en el catálogo del otro lado y la plantilla quedaría incompleta.
 */
export const SCHEDULE_UNAVAILABLE_TYPES = ["transfer", "opening_credit"] as const;

/** Entidad mínima para abrir el diálogo. A diferencia de `Repetir`, no se serializa en la URL. */
export type SchedulePrefill = {
  transactionId: number;
};

export function canScheduleTransaction(item: TransactionHistoryItem): boolean {
  if ((SCHEDULE_UNAVAILABLE_TYPES as readonly HistoryTransactionType[]).includes(item.type)) {
    return false;
  }

  return item.transferGroupId === null;
}

/**
 * El diálogo vive en la misma página, así que no necesita estado en la URL: a diferencia de
 * `buildRepeatPrefill`, esto no serializa nada, solo entrega el id que el diálogo envía al
 * `dryRun`. Devolver `null` mantiene la misma guarda que usa la columna para pintar el botón.
 */
export function buildSchedulePrefill(item: TransactionHistoryItem): SchedulePrefill | null {
  if (!canScheduleTransaction(item)) {
    return null;
  }

  return { transactionId: item.transactionId };
}

/**
 * Estado editable del diálogo. `kind` viaja solo de lectura: el backend trata el tipo como parte de
 * la identidad de la plantilla y el catálogo tampoco lo deja cambiar tras el alta, así que se muestra
 * pero no se edita (y por eso forma parte del estado: el cuerpo de escritura lo exige siempre).
 */
export type ScheduleFormValues = {
  kind: string;
  name: string;
  amountMode: string;
  amountMxn: string;
  dayOfMonth: string;
  accountId: number | null;
  categoryId: number | null;
  subcategoryId: number | null;
  merchantId: number | null;
  startsPeriod: string;
};

export type ScheduleFormErrors = Partial<
  Record<"name" | "amountMode" | "amountMxn" | "dayOfMonth" | "scope" | "startsPeriod", string>
>;

/**
 * Propuesta del backend → formulario. Un valor ausente o nulo se queda vacío, nunca `0`: un id `0`
 * se mandaría al API como si fuera una categoría real y un monto `0` presentaría un importe falso.
 */
export function mapProposalToForm(proposal: RecurringItem): ScheduleFormValues {
  return {
    kind: proposal.kind,
    name: proposal.name,
    amountMode: isAverageMode(proposal.amountMode) ? "average" : "fixed",
    amountMxn: proposal.amountMxn === null ? "" : String(proposal.amountMxn),
    dayOfMonth: String(proposal.dayOfMonth),
    accountId: asId(proposal.accountId),
    categoryId: asId(proposal.categoryId),
    subcategoryId: asId(proposal.subcategoryId),
    merchantId: asId(proposal.merchantId),
    startsPeriod: proposal.startsPeriod
  };
}

function isAverageMode(amountMode: string): boolean {
  return amountMode.trim().toLowerCase() === "average";
}

/** Solo un entero positivo es un id utilizable; el resto se trata como "sin valor". */
function asId(value: number | null): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Compara el formulario contra la propuesta sin normalizar, para no marcar como editado lo que el
 * usuario no tocó: `" 12000 "` y `12000` son el mismo monto, igual que `"2026-11"` y `"2026-11"`.
 * Cuando el texto dejó de ser un número válido, el formulario se considera editado y por eso pasa
 * por la validación local.
 */
export function isProposalUnchanged(form: ScheduleFormValues, proposal: RecurringItem): boolean {
  return form.kind === proposal.kind
    && form.name.trim() === proposal.name.trim()
    && form.amountMode === (isAverageMode(proposal.amountMode) ? "average" : "fixed")
    && sameAmount(form.amountMxn, proposal.amountMxn)
    && parseDayOfMonth(form.dayOfMonth) === proposal.dayOfMonth
    && asId(form.accountId) === proposal.accountId
    && asId(form.categoryId) === proposal.categoryId
    && asId(form.subcategoryId) === proposal.subcategoryId
    && asId(form.merchantId) === proposal.merchantId
    && form.startsPeriod.trim() === proposal.startsPeriod.trim();
}

function sameAmount(formValue: string, proposalAmount: number | null): boolean {
  if (proposalAmount === null) {
    return formValue.trim().length === 0;
  }

  const parsed = parseAmountMxn(formValue);
  return parsed !== null && parsed === proposalAmount;
}

/**
 * Mismas reglas que el drawer del catálogo (`validateRecurringItemForm`), con dos diferencias
 * deliberadas: el diálogo no conoce `today`, así que no exige que `startsPeriod` sea el mes en curso
 * o posterior (lo gobierna el backend y el `dryRun` ya propone el mes siguiente), y no valida
 * `endsPeriod` ni `effectiveFrom` porque este diálogo no los ofrece.
 */
export function validateScheduleForm(form: ScheduleFormValues): ScheduleFormErrors {
  const errors: ScheduleFormErrors = {};

  const name = form.name.trim();
  if (name.length < MIN_RECURRING_ITEM_NAME_LENGTH) {
    errors.name = `Mínimo ${MIN_RECURRING_ITEM_NAME_LENGTH} caracteres`;
  } else if (name.length > MAX_RECURRING_ITEM_NAME_LENGTH) {
    errors.name = `Máximo ${MAX_RECURRING_ITEM_NAME_LENGTH} caracteres`;
  }

  const amountMode = form.amountMode.trim();
  if (!isRecurringItemAmountMode(amountMode)) {
    errors.amountMode = "Selecciona un modo de monto";
  } else if (amountMode !== "average") {
    // En modo promedio el monto lo deriva el backend del historial: no se pide.
    const amountMxn = parseAmountMxn(form.amountMxn);
    if (amountMxn === null || amountMxn <= 0) {
      errors.amountMxn = "Monto mayor a 0";
    }
  }

  const dayOfMonth = parseDayOfMonth(form.dayOfMonth);
  if (dayOfMonth === null || dayOfMonth < MIN_DAY_OF_MONTH || dayOfMonth > MAX_DAY_OF_MONTH) {
    errors.dayOfMonth = `Día entre ${MIN_DAY_OF_MONTH} y ${MAX_DAY_OF_MONTH}`;
  }

  if (!isPeriodKey(form.startsPeriod)) {
    errors.startsPeriod = "Periodo requerido (aaaa-mm)";
  }

  // Scope XOR: exactamente uno de categoría o subcategoría, y el ingreso no admite subcategoría.
  if (form.categoryId !== null && form.subcategoryId !== null) {
    errors.scope = "Elige categoría o subcategoría, no ambas";
  } else if (isIncomeKind(form.kind)) {
    if (form.subcategoryId !== null) {
      errors.scope = "Un ingreso no admite subcategoría";
    } else if (form.categoryId === null) {
      errors.scope = "Selecciona una categoría de ingreso";
    }
  } else if (form.categoryId === null && form.subcategoryId === null) {
    errors.scope = "Selecciona una categoría o una subcategoría";
  }

  return errors;
}

function isIncomeKind(kind: string): boolean {
  return kind.trim().toLowerCase() === "income";
}

/**
 * Cuerpo de escritura con el mismo conjunto de campos que acepta `POST /api/bff/catalogs/recurring-items`.
 *
 * `autoExecute` y `effectiveFrom` viajan en `false`/`null` a propósito: el diálogo no ofrece esas dos
 * decisiones (la fecha efectiva es manual y la ejecución automática exige cuenta y Telegram
 * configurada), así que las deja en manos del catálogo. `active` no viaja porque el alta nace activa
 * y el estado solo cambia con su propio `PATCH`.
 */
export function toScheduleWritePayload(form: ScheduleFormValues): RecurringItemWriteRequest {
  const amountMode = form.amountMode.trim();
  const isAverage = amountMode === "average";
  const useSubcategory = form.subcategoryId !== null && form.categoryId === null;

  return {
    kind: (isIncomeKind(form.kind) ? "income" : "expense") as RecurringItemKind,
    name: form.name.trim(),
    amountMode: isAverage ? "average" : "fixed",
    amountMxn: isAverage ? null : parseAmountMxn(form.amountMxn),
    dayOfMonth: parseDayOfMonth(form.dayOfMonth) ?? 0,
    categoryId: useSubcategory ? null : form.categoryId,
    subcategoryId: useSubcategory ? form.subcategoryId : null,
    accountId: form.accountId,
    merchantId: form.merchantId,
    startsPeriod: form.startsPeriod.trim(),
    endsPeriod: null,
    autoExecute: false,
    effectiveFrom: null
  };
}

/* -------------------------------------------------------------------------------------------- */
/* Presentación del resumen de confirmación                                                      */
/* -------------------------------------------------------------------------------------------- */

export function scheduleKindLabel(kind: string): string {
  return recurringItemKindLabel(kind);
}

/** `—` en modo promedio o sin monto: el importe real todavía no existe. */
export function scheduleAmountLabel(amountMxn: number | null, amountMode: string): string {
  return formatRecurringItemAmount(amountMxn, amountMode);
}

/** `—` cuando el día no es un entero legible; nunca un `0` disfrazado de día. */
export function scheduleDayLabel(dayOfMonth: number | string): string {
  const day = typeof dayOfMonth === "number" ? dayOfMonth : parseDayOfMonth(dayOfMonth);
  if (day === null || !Number.isInteger(day) || day < MIN_DAY_OF_MONTH || day > MAX_DAY_OF_MONTH) {
    return "—";
  }

  return `Día ${day} de cada mes`;
}

/** Entero legible del día, o `null`: el resumen y la copia comparten la misma lectura. */
function readableDay(dayOfMonth: number | string): number | null {
  const day = typeof dayOfMonth === "number" ? dayOfMonth : parseDayOfMonth(dayOfMonth);
  return day !== null && Number.isInteger(day) && day >= MIN_DAY_OF_MONTH && day <= MAX_DAY_OF_MONTH ? day : null;
}

/**
 * Copia que separa esta pantalla de `Repetir`. "Repetir" precarga el formulario para capturar la
 * transacción **ahora**; esto crea una plantilla que **se repetirá cada mes** hacia adelante, y el
 * texto tiene que decirlo porque los dos botones conviven en la misma celda.
 */
export function scheduleRepeatCopy(name: string, startsPeriod: string, dayOfMonth: number | string): string {
  const period = startsPeriod.trim();
  const when = isPeriodKey(period) ? ` desde el periodo ${period}` : "";
  const day = readableDay(dayOfMonth);
  const whenDay = day === null ? "" : `, el día ${day} de cada mes`;

  return `“${name.trim()}” se repetirá cada mes${when}${whenDay}.`;
}

/** Aviso corto que acompaña al resumen y descarta la confusión con "Repetir". */
export const SCHEDULE_NOT_NOW_COPY = "Esto no captura nada ahora: crea una plantilla para que el gasto o ingreso se repita cada mes.";

/**
 * Colisión por `(kind, name)`: el backend no duplica y la UI ofrece editar la existente. El choque
 * también ocurre con una plantilla **inactiva**, porque la clave única no incluye `active`, así que
 * el texto no puede afirmar que la existente está activa.
 */
export const SCHEDULE_CONFLICT_COPY = "Ya existe una plantilla con ese nombre";

/**
 * Opciones de subcategoría del diálogo. Se acotan por la categoría **de referencia** (`scope`) y no
 * por `form.categoryId`: elegir una subcategoría limpia el alcance de categoría (XOR), y si la lista
 * dependiera del formulario la propia opción elegida desaparecería al seleccionarla.
 */
export function subcategoryOptionsForScope<T extends { categoryId: number }>(
  subcategories: readonly T[],
  scopeCategoryId: number | null,
  kind: string
): readonly T[] {
  if (kind === "income" || scopeCategoryId === null) {
    return [];
  }

  return subcategories.filter((subcategory) => subcategory.categoryId === scopeCategoryId);
}
