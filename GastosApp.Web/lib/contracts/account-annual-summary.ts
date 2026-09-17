/**
 * Contrato de `GET /api/accounts/{id}/annual-summary?year=YYYY`.
 *
 * Reglas que este contrato debe preservar:
 * - Las transferencias solo viven en `netTransfers`: nunca se suman como ingreso ni gasto.
 * - El backend envía los 12 meses del año y el saldo de cierre ya calculado, incluyendo los
 *   meses sin movimientos (conservan el saldo anterior). El frontend nunca recalcula ni
 *   sustituye un saldo por cero.
 * - Los agregados anuales faltantes se derivan sumando los meses, que es la misma identidad
 *   que aplica el backend; no se inventan importes.
 */

export type AccountAnnualSummaryMonth = {
  /** Mes calendario 1..12. */
  month: number;
  income: number;
  expense: number;
  netTransfers: number;
  closingBalance: number;
  /** `false` = mes sin movimientos: su saldo de cierre es arrastre del mes anterior. */
  hasActivity: boolean;
};

export type AccountAnnualSummary = {
  accountId: number;
  year: number;
  openingBalance: number;
  months: AccountAnnualSummaryMonth[];
  yearIncome: number;
  yearExpense: number;
  yearNetTransfers: number;
  closingBalance: number;
};

/** El backend acepta 1..9998, pero `?year=` es de cuatro dígitos: fuera de eso es un dedazo. */
export const ANNUAL_SUMMARY_MIN_YEAR = 1000;
export const ANNUAL_SUMMARY_MAX_YEAR = 9998;

/** Años hacia atrás que se ofrecen cuando la cuenta no declara fecha de inicio. */
export const ANNUAL_SUMMARY_DEFAULT_WINDOW_YEARS = 5;

/** Tope de opciones del selector para no generar un `select` inmanejable. */
export const ANNUAL_SUMMARY_MAX_YEAR_OPTIONS = 30;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

/** El API responde camelCase; se aceptan ambas grafías por robustez ante serializadores. */
function pick(record: UnknownRecord, camelKey: string, pascalKey: string): unknown {
  return camelKey in record ? record[camelKey] : record[pascalKey];
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toAmount(value: unknown): number {
  return toNumber(value) ?? 0;
}

function toMonth(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    return null;
  }

  return parsed;
}

function toActivityFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

export function isAnnualSummaryYear(value: unknown): boolean {
  if (typeof value === "string" && !/^\d{4}$/.test(value.trim())) {
    return false;
  }

  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isInteger(parsed) && parsed >= ANNUAL_SUMMARY_MIN_YEAR && parsed <= ANNUAL_SUMMARY_MAX_YEAR;
}

/** Año de `?year=`: fuera de rango o no numérico cae al año por defecto (nunca a 0). */
export function parseAnnualSummaryYear(value: unknown, fallback: number): number {
  return isAnnualSummaryYear(value) ? Number(typeof value === "number" ? value : String(value).trim()) : fallback;
}

/**
 * Años seleccionables en orden descendente. `earliestYear` se recorta a `latestYear` y la lista
 * se limita a `ANNUAL_SUMMARY_MAX_YEAR_OPTIONS` entradas.
 */
export function annualSummaryYearOptions(earliestYear: number, latestYear: number): number[] {
  if (!isAnnualSummaryYear(latestYear)) {
    return [];
  }

  const lowerBound = Math.max(
    isAnnualSummaryYear(earliestYear) ? Math.min(earliestYear, latestYear) : latestYear,
    latestYear - (ANNUAL_SUMMARY_MAX_YEAR_OPTIONS - 1),
    ANNUAL_SUMMARY_MIN_YEAR
  );

  const years: number[] = [];
  for (let year = latestYear; year >= lowerBound; year -= 1) {
    years.push(year);
  }

  return years;
}

function normalizeMonths(raw: unknown): AccountAnnualSummaryMonth[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const byMonth = new Map<number, AccountAnnualSummaryMonth>();

  for (const item of raw) {
    if (!isRecord(item)) continue;

    const month = toMonth(pick(item, "month", "Month"));
    if (month === null) continue;

    const income = toAmount(pick(item, "income", "Income"));
    const expense = toAmount(pick(item, "expense", "Expense"));
    const netTransfers = toAmount(pick(item, "netTransfers", "NetTransfers"));
    const declaredActivity = toActivityFlag(pick(item, "hasActivity", "HasActivity"));

    byMonth.set(month, {
      month,
      income,
      expense,
      netTransfers,
      closingBalance: toAmount(pick(item, "closingBalance", "ClosingBalance")),
      // Sin bandera explícita, un importe distinto de cero ya es movimiento. Un mes con
      // movimientos que netean cero conserva al menos uno de sus importes.
      hasActivity: declaredActivity ?? (income !== 0 || expense !== 0 || netTransfers !== 0)
    });
  }

  return [...byMonth.values()].sort((a, b) => a.month - b.month);
}

function sumMonths(months: AccountAnnualSummaryMonth[], field: "income" | "expense" | "netTransfers"): number {
  return months.reduce((total, month) => total + month[field], 0);
}

/**
 * Devuelve `null` cuando el payload no identifica una cuenta o un año válido: sin identidad no se
 * puede mostrar un histórico creíble.
 */
export function normalizeAccountAnnualSummary(input: unknown): AccountAnnualSummary | null {
  if (!isRecord(input)) {
    return null;
  }

  const accountId = toNumber(pick(input, "accountId", "AccountId"));
  const year = toNumber(pick(input, "year", "Year"));

  if (accountId === null || !Number.isInteger(accountId) || accountId <= 0) {
    return null;
  }

  if (year === null || !isAnnualSummaryYear(year)) {
    return null;
  }

  const months = normalizeMonths(pick(input, "months", "Months"));
  const declaredClosing = toNumber(pick(input, "closingBalance", "ClosingBalance"));

  return {
    accountId,
    year,
    openingBalance: toAmount(pick(input, "openingBalance", "OpeningBalance")),
    months,
    yearIncome: toNumber(pick(input, "yearIncome", "YearIncome")) ?? sumMonths(months, "income"),
    yearExpense: toNumber(pick(input, "yearExpense", "YearExpense")) ?? sumMonths(months, "expense"),
    yearNetTransfers: toNumber(pick(input, "yearNetTransfers", "YearNetTransfers")) ?? sumMonths(months, "netTransfers"),
    // El cierre del año es el cierre del último mes del payload; coincide con el agregado del
    // backend, así que derivarlo no cambia ninguna cifra.
    closingBalance: declaredClosing ?? months.at(-1)?.closingBalance ?? 0
  };
}
