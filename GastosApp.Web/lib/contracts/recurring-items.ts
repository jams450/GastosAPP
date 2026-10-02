import type { ValidationResult } from "@/lib/contracts/catalogs";

type UnknownRecord = Record<string, unknown>;

export const RECURRING_ITEM_KINDS = ["income", "expense"] as const;
export const RECURRING_ITEM_AMOUNT_MODES = ["fixed", "average"] as const;

export type RecurringItemKind = (typeof RECURRING_ITEM_KINDS)[number];
export type RecurringItemAmountMode = (typeof RECURRING_ITEM_AMOUNT_MODES)[number];

export function isRecurringItemKind(value: string): value is RecurringItemKind {
  return (RECURRING_ITEM_KINDS as readonly string[]).includes(value);
}

export function isRecurringItemAmountMode(value: string): value is RecurringItemAmountMode {
  return (RECURRING_ITEM_AMOUNT_MODES as readonly string[]).includes(value);
}

/**
 * Plantilla de gasto o ingreso programado. `kind` y `amountMode` se conservan como texto crudo:
 * el normalizador no inventa un valor válido para una fila que el backend no reconoce, y los
 * guardas de arriba estrechan el tipo donde el formulario lo necesita.
 */
export type RecurringItem = {
  recurringItemId: number;
  kind: string;
  name: string;
  amountMode: string;
  /** `null` en modo `average`: el monto lo deriva el backend del historial. */
  amountMxn: number | null;
  dayOfMonth: number;
  categoryId: number | null;
  subcategoryId: number | null;
  accountId: number | null;
  merchantId: number | null;
  startsPeriod: string;
  endsPeriod: string | null;
  active: boolean;
  autoExecute: boolean;
  effectiveFrom: string | null;
  created: string | null;
  updated: string | null;
};

/**
 * Alta y edición. El conjunto de campos es idéntico en ambos casos y `kind` viaja siempre porque
 * el API lo exige, aunque en la UI es inmutable tras el alta. `active` NO viaja: el alta nace
 * activa y el estado solo cambia con `PATCH /api/recurring-items/{id}/active`.
 */
export type RecurringItemWriteRequest = {
  kind: RecurringItemKind;
  name: string;
  amountMode: RecurringItemAmountMode;
  amountMxn: number | null;
  dayOfMonth: number;
  categoryId: number | null;
  subcategoryId: number | null;
  accountId: number | null;
  merchantId: number | null;
  startsPeriod: string;
  endsPeriod: string | null;
  autoExecute: boolean;
  effectiveFrom: string | null;
};

/** Soporte del checkbox `autoExecute`: nunca expone credenciales, solo la disponibilidad. */
export type RecurringItemConfig = {
  autoExecuteAvailable: boolean;
  reason: string | null;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toRequiredId(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Solo acepta números o cadenas numéricas. Cualquier otro tipo (booleanos, objetos, arreglos)
 * devuelve `null`: `Number(false)` es `0` y `Number(true)` es `1`, y ambos inventarían un id.
 */
function toOptionalInt(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * `amountMxn` nunca se inventa: un monto ausente o no numérico es `null`, porque el modo `average`
 * lo omite a propósito y un `0` presentaría un monto falso en la columna.
 */
function toOptionalMoney(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

function toText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeRecurringItem(input: unknown): RecurringItem | null {
  if (!isRecord(input)) {
    return null;
  }

  const recurringItemId = toRequiredId(input.recurringItemId);
  if (recurringItemId === null) {
    return null;
  }

  // `dayOfMonth` es `NOT NULL` en el backend, así que una fila sin día es ilegible y se descarta
  // en vez de mostrar un 0 que el usuario leería como "día 0".
  const dayOfMonth = toOptionalInt(input.dayOfMonth);
  if (dayOfMonth === null) {
    return null;
  }

  return {
    recurringItemId,
    kind: toText(input.kind, ""),
    name: toText(input.name, "Sin nombre"),
    amountMode: toText(input.amountMode, "fixed"),
    amountMxn: toOptionalMoney(input.amountMxn),
    dayOfMonth,
    categoryId: toOptionalInt(input.categoryId),
    subcategoryId: toOptionalInt(input.subcategoryId),
    accountId: toOptionalInt(input.accountId),
    merchantId: toOptionalInt(input.merchantId),
    startsPeriod: toText(input.startsPeriod, ""),
    endsPeriod: toOptionalText(input.endsPeriod),
    active: toBool(input.active),
    autoExecute: toBool(input.autoExecute),
    effectiveFrom: toOptionalText(input.effectiveFrom),
    created: toOptionalText(input.created),
    updated: toOptionalText(input.updated)
  };
}

export function normalizeRecurringItems(input: unknown): RecurringItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeRecurringItem(item))
    .filter((item): item is RecurringItem => item !== null);
}

export function normalizeRecurringItemConfig(input: unknown): RecurringItemConfig {
  if (!isRecord(input)) {
    return { autoExecuteAvailable: false, reason: null };
  }

  return {
    autoExecuteAvailable: toBool(input.autoExecuteAvailable),
    reason: toOptionalText(input.reason)
  };
}

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const NAME_PATTERN_LENGTH = { min: 2, max: 120 } as const;

function toPeriod(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return PERIOD_PATTERN.test(trimmed) ? trimmed : null;
}

function toOptionalPeriod(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return toPeriod(value);
}

/**
 * `DateTime` llega como `yyyy-MM-ddTHH:mm:ss`; un `<input type="date">` solo acepta `yyyy-MM-dd` y
 * la fecha viene sin zona, así que cortar el prefijo es seguro.
 */
function toDateInputValue(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : "";
}

/**
 * Guarda de escritura para el BFF. Reutiliza las reglas del dominio del backend (XOR de alcance,
 * monto solo en modo fijo, periodos `yyyy-MM` en orden) para no dejar que una petición manipulada
 * llegue al API con un cuerpo que devolvería 400.
 *
 * Los mensajes son en inglés a propósito: este validador responde al navegador vía BFF y el
 * `parseApiError` los muestra tal cual; el texto en español de la UI vive en el modelo del
 * formulario, que es quien valida antes de enviar.
 */
export function validateRecurringItemPayload(input: unknown): ValidationResult<RecurringItemWriteRequest> {
  if (!isRecord(input)) {
    return { ok: false, message: "Invalid payload" };
  }

  const kind = typeof input.kind === "string" ? input.kind.trim().toLowerCase() : "";
  if (!isRecurringItemKind(kind)) {
    return { ok: false, message: "kind must be income or expense" };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < NAME_PATTERN_LENGTH.min || name.length > NAME_PATTERN_LENGTH.max) {
    return { ok: false, message: "Name is required" };
  }

  const amountModeRaw = input.amountMode === undefined || input.amountMode === null || input.amountMode === ""
    ? "fixed"
    : String(input.amountMode).trim().toLowerCase();
  if (!isRecurringItemAmountMode(amountModeRaw)) {
    return { ok: false, message: "amountMode must be fixed or average" };
  }

  const amountMxn = toOptionalMoney(input.amountMxn);
  if (amountModeRaw === "fixed" && (amountMxn === null || amountMxn <= 0)) {
    return { ok: false, message: "amountMxn must be greater than 0 when amountMode is fixed" };
  }

  const dayOfMonth = toOptionalInt(input.dayOfMonth);
  if (dayOfMonth === null || dayOfMonth < 1 || dayOfMonth > 31) {
    return { ok: false, message: "dayOfMonth must be an integer between 1 and 31" };
  }

  // Scope XOR: exactamente uno de categoría o subcategoría, y un ingreso nunca admite subcategoría.
  const categoryId = toOptionalInt(input.categoryId);
  const subcategoryId = toOptionalInt(input.subcategoryId);
  if (categoryId === null && subcategoryId === null) {
    return { ok: false, message: "categoryId or subcategoryId is required" };
  }
  if (categoryId !== null && subcategoryId !== null) {
    return { ok: false, message: "categoryId and subcategoryId are mutually exclusive" };
  }
  if (kind === "income" && subcategoryId !== null) {
    return { ok: false, message: "subcategoryId is not allowed for income" };
  }

  const startsPeriod = toPeriod(input.startsPeriod);
  if (!startsPeriod) {
    return { ok: false, message: "startsPeriod is required with format yyyy-MM" };
  }

  const endsPeriod = toOptionalPeriod(input.endsPeriod);
  if (input.endsPeriod !== undefined && input.endsPeriod !== null && input.endsPeriod !== "" && !endsPeriod) {
    return { ok: false, message: "endsPeriod must use format yyyy-MM" };
  }
  if (endsPeriod !== null && endsPeriod < startsPeriod) {
    return { ok: false, message: "endsPeriod must not be earlier than startsPeriod" };
  }

  return {
    ok: true,
    data: {
      kind,
      name,
      amountMode: amountModeRaw,
      // En modo `average` el monto se omite a propósito: el backend lo promedia desde el historial.
      amountMxn: amountModeRaw === "average" ? null : amountMxn,
      dayOfMonth,
      categoryId: subcategoryId !== null ? null : categoryId,
      subcategoryId: categoryId !== null ? null : subcategoryId,
      accountId: toOptionalInt(input.accountId),
      merchantId: toOptionalInt(input.merchantId),
      startsPeriod,
      endsPeriod,
      autoExecute: kind === "expense" ? toBool(input.autoExecute) : false,
      effectiveFrom: toDateInputValue(typeof input.effectiveFrom === "string" ? input.effectiveFrom : null) || null
    }
  };
}

export { toDateInputValue as toRecurringItemDateInputValue };
