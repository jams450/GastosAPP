export const BUDGET_PERIOD_TIMEZONE = "America/Mexico_City";

type UnknownRecord = Record<string, unknown>;

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type BudgetUsageStatus = "ok" | "warning" | "exceeded";

export type BudgetThreshold = {
  thresholdId: number;
  name: string;
  percent: number;
  active: boolean;
};

export type Budget = {
  budgetId: number;
  userId: number;
  periodKey: string;
  name: string;
  categoryId: number | null;
  subcategoryId: number | null;
  amountMxn: number;
  active: boolean;
  created: string | null;
  updated: string | null;
  thresholds: BudgetThreshold[];
};

export type BudgetReachedThreshold = {
  thresholdId: number;
  name: string;
  percent: number;
};

/**
 * Estado calculado de un presupuesto en su periodo. El desglose es aditivo:
 * `effective = spent + committed` y `forecast = effective + projected`.
 *
 * `percentUsed` es el desglose **mostrado** (`spentPercent + committedPercent`);
 * `thresholdPercent` es el número que decidió `status` y `reachedThreshold`, que puede
 * coincidir con `percentUsed` o con `spentPercent` según `Alerts:CommittedCountsEnabled`.
 * El campo heredado `spent`/`remaining`/`percentUsed` se conserva sin cambios.
 */
export type BudgetPeriodStatus = {
  budgetId: number;
  name: string;
  periodKey: string;
  categoryId: number | null;
  subcategoryId: number | null;
  active: boolean;
  amountMxn: number;
  spent: number;
  /** Gasto ejecutado como porcentaje del límite. */
  spentPercent: number;
  /** Planificado no ejecutado con periodo abierto. Cero si el periodo ya cerró. */
  committed: number;
  committedPercent: number;
  /** Cuotas derivadas de promedio no confirmadas. No compromete dinero. */
  projected: number;
  projectedPercent: number;
  /** `spent + committed`: contra esto se calcula el restante. */
  effective: number;
  /** `effective + projected`. Informativo. */
  forecast: number;
  /** Porcentaje que decide `status`: puede ser `percentUsed` o `spentPercent`. */
  thresholdPercent: number;
  remaining: number;
  /** Suma de `plannedAmount` de las partidas no canceladas del alcance. */
  plannedAmount: number;
  /** `plannedAmount − spent`: desviación del plan. */
  variance: number;
  itemsPending: number;
  itemsExecuted: number;
  /** Partidas `pending` de un periodo cerrado: caducaron sin ejecutarse. */
  itemsUnexecuted: number;
  itemsIgnored: number;
  plannedIncome: number;
  committedIncome: number;
  projectedIncome: number;
  percentUsed: number;
  status: BudgetUsageStatus;
  reachedThreshold: BudgetReachedThreshold | null;
};

/**
 * Conteos de un bloque del rollover. `attempted` es siempre
 * `inserted + skipped + omitted`, para que un descarte por clave ocupada sea visible en vez de
 * confundirse con una falta de monto derivado.
 *
 * Cada conteo es `number | null`: un conteo ausente o no numérico es **desconocido**, no `0`. Un `0`
 * inventado se leería como "no había nada que clonar" y apagaría la confirmación de una escritura que
 * el backend sí tenía que hacer.
 */
export type BudgetRolloverCounts = {
  attempted: number | null;
  inserted: number | null;
  /** Candidatas que no se insertaron porque la clave única ya existía. */
  skipped: number | null;
  /** Candidatas descartadas sin intentar insertar (monto promedio sin historial). */
  omitted: number | null;
};

/** Modos de rollover que acepta `POST /api/budgets/rollover`. */
export type BudgetRolloverMode = "copy" | "remount" | "copy-and-remount";

/** Lo que el backend escribe, o lo que escribiría con `dryRun`. */
export type BudgetRolloverResponse = {
  fromPeriod: string;
  toPeriod: string;
  /** Modo efectivamente aplicado, ya normalizado por el backend. */
  mode: string;
  dryRun: boolean;
  /** Presupuestos clonados del mes origen con sus umbrales. */
  budgets: BudgetRolloverCounts;
  /** Partidas `manual` copiadas con la fecha recalculada al mes destino. */
  manualItems: BudgetRolloverCounts;
  /** Partidas `template` regeneradas desde su plantilla de programado. */
  remountedItems: BudgetRolloverCounts;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
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

/**
 * Conteo entero o `null` de "desconocido". A diferencia de `toFiniteNumber`, **nunca** devuelve
 * `0` por defecto: un conteo ausente no es un conteo cero.
 */
/**
 * Solo acepta números o cadenas numéricas. Cualquier otro tipo (booleanos, objetos, arreglos)
 * devuelve `null`: `Number(false)` es `0` y un `0` fabricado apagaría una escritura real, porque la
 * UI usa `inserted === 0` para decidir que no hay nada que clonar.
 */
function toOptionalCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toUsageStatus(value: unknown): BudgetUsageStatus {
  return value === "warning" || value === "exceeded" ? value : "ok";
}

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidPeriodKey(value: string): boolean {
  return PERIOD_PATTERN.test(value);
}

/** Periodo actual (`yyyy-MM`) en la zona horaria que usa el backend por defecto. */
export function currentBudgetPeriod(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUDGET_PERIOD_TIMEZONE,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  if (!year || !month) {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  return `${year}-${month}`;
}

/** Valida `?period=yyyy-MM`. Ausente = mes actual, para no depender del default del API. */
export function resolvePeriodParam(value: string | null | undefined): ValidationResult<string> {
  const raw = typeof value === "string" ? value.trim() : "";

  if (raw.length === 0) {
    return { ok: true, data: currentBudgetPeriod() };
  }

  if (!isValidPeriodKey(raw)) {
    return { ok: false, message: "period must use yyyy-MM format" };
  }

  return { ok: true, data: raw };
}

export function validatePeriodKey(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") {
    return { ok: false, message: "periodKey must use yyyy-MM format" };
  }

  const trimmed = value.trim();
  if (!isValidPeriodKey(trimmed)) {
    return { ok: false, message: "periodKey must use yyyy-MM format" };
  }

  return { ok: true, data: trimmed };
}

export function validatePeriodKeyFromBody(input: unknown): ValidationResult<string> {
  if (!isRecord(input)) {
    return { ok: false, message: "Invalid payload" };
  }

  return validatePeriodKey(input.periodKey ?? input.PeriodKey);
}

export function normalizeBudgetThreshold(input: unknown): BudgetThreshold | null {
  if (!isRecord(input)) {
    return null;
  }

  const thresholdId = toOptionalInt(input.thresholdId ?? input.ThresholdId);
  if (thresholdId === null || thresholdId <= 0) {
    return null;
  }

  return {
    thresholdId,
    name: toText(input.name ?? input.Name, "Umbral"),
    percent: toFiniteNumber(input.percent ?? input.Percent),
    active: toBool(input.active ?? input.Active, true)
  };
}

export function normalizeBudget(input: unknown): Budget | null {
  if (!isRecord(input)) {
    return null;
  }

  const budgetId = toOptionalInt(input.budgetId ?? input.BudgetId);
  if (budgetId === null || budgetId <= 0) {
    return null;
  }

  const rawThresholds = input.thresholds ?? input.Thresholds;
  const thresholds = Array.isArray(rawThresholds)
    ? rawThresholds
        .map((item) => normalizeBudgetThreshold(item))
        .filter((item): item is BudgetThreshold => item !== null)
        .sort((a, b) => a.percent - b.percent)
    : [];

  return {
    budgetId,
    userId: toOptionalInt(input.userId ?? input.UserId) ?? 0,
    periodKey: typeof (input.periodKey ?? input.PeriodKey) === "string" ? String(input.periodKey ?? input.PeriodKey).trim() : "",
    name: toText(input.name ?? input.Name, "Sin nombre"),
    categoryId: toOptionalInt(input.categoryId ?? input.CategoryId),
    subcategoryId: toOptionalInt(input.subcategoryId ?? input.SubcategoryId),
    amountMxn: toFiniteNumber(input.amountMxn ?? input.AmountMxn),
    active: toBool(input.active ?? input.Active, true),
    created: toOptionalText(input.created ?? input.Created),
    updated: toOptionalText(input.updated ?? input.Updated),
    thresholds
  };
}

export function normalizeBudgets(input: unknown): Budget[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizeBudget(item)).filter((item): item is Budget => item !== null);
}

function normalizeReachedThreshold(input: unknown): BudgetReachedThreshold | null {
  if (!isRecord(input)) {
    return null;
  }

  const thresholdId = toOptionalInt(input.thresholdId ?? input.ThresholdId);
  if (thresholdId === null || thresholdId <= 0) {
    return null;
  }

  return {
    thresholdId,
    name: toText(input.name ?? input.Name, "Umbral"),
    percent: toFiniteNumber(input.percent ?? input.Percent)
  };
}

export function normalizeBudgetStatus(input: unknown): BudgetPeriodStatus | null {
  if (!isRecord(input)) {
    return null;
  }

  const budgetId = toOptionalInt(input.budgetId ?? input.BudgetId);
  if (budgetId === null || budgetId <= 0) {
    return null;
  }

  return {
    budgetId,
    name: toText(input.name ?? input.Name, "Sin nombre"),
    periodKey: typeof (input.periodKey ?? input.PeriodKey) === "string" ? String(input.periodKey ?? input.PeriodKey).trim() : "",
    categoryId: toOptionalInt(input.categoryId ?? input.CategoryId),
    subcategoryId: toOptionalInt(input.subcategoryId ?? input.SubcategoryId),
    active: toBool(input.active ?? input.Active, true),
    amountMxn: toFiniteNumber(input.amountMxn ?? input.AmountMxn),
    spent: toFiniteNumber(input.spent ?? input.Spent),
    spentPercent: toFiniteNumber(input.spentPercent ?? input.SpentPercent),
    committed: toFiniteNumber(input.committed ?? input.Committed),
    committedPercent: toFiniteNumber(input.committedPercent ?? input.CommittedPercent),
    projected: toFiniteNumber(input.projected ?? input.Projected),
    projectedPercent: toFiniteNumber(input.projectedPercent ?? input.ProjectedPercent),
    effective: toFiniteNumber(input.effective ?? input.Effective),
    forecast: toFiniteNumber(input.forecast ?? input.Forecast),
    thresholdPercent: toFiniteNumber(input.thresholdPercent ?? input.ThresholdPercent),
    remaining: toFiniteNumber(input.remaining ?? input.Remaining),
    plannedAmount: toFiniteNumber(input.plannedAmount ?? input.PlannedAmount),
    variance: toFiniteNumber(input.variance ?? input.Variance),
    itemsPending: toOptionalInt(input.itemsPending ?? input.ItemsPending) ?? 0,
    itemsExecuted: toOptionalInt(input.itemsExecuted ?? input.ItemsExecuted) ?? 0,
    itemsUnexecuted: toOptionalInt(input.itemsUnexecuted ?? input.ItemsUnexecuted) ?? 0,
    itemsIgnored: toOptionalInt(input.itemsIgnored ?? input.ItemsIgnored) ?? 0,
    plannedIncome: toFiniteNumber(input.plannedIncome ?? input.PlannedIncome),
    committedIncome: toFiniteNumber(input.committedIncome ?? input.CommittedIncome),
    projectedIncome: toFiniteNumber(input.projectedIncome ?? input.ProjectedIncome),
    percentUsed: toFiniteNumber(input.percentUsed ?? input.PercentUsed),
    status: toUsageStatus(input.status ?? input.Status),
    reachedThreshold: normalizeReachedThreshold(input.reachedThreshold ?? input.ReachedThreshold)
  };
}

export function normalizeBudgetStatuses(input: unknown): BudgetPeriodStatus[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeBudgetStatus(item))
    .filter((item): item is BudgetPeriodStatus => item !== null);
}

function emptyRolloverCounts(): BudgetRolloverCounts {
  return { attempted: null, inserted: null, skipped: null, omitted: null };
}

function normalizeRolloverCounts(input: unknown): BudgetRolloverCounts {
  if (!isRecord(input)) {
    return emptyRolloverCounts();
  }

  return {
    attempted: toOptionalCount(input.attempted ?? input.Attempted),
    inserted: toOptionalCount(input.inserted ?? input.Inserted),
    skipped: toOptionalCount(input.skipped ?? input.Skipped),
    omitted: toOptionalCount(input.omitted ?? input.Omitted)
  };
}

/**
 * Normaliza el resultado del rollover. Un bloque ausente queda con conteos `null` ("desconocido") en
 * vez de `0`: la UI usa esos ceros para decidir si hay algo que clonar, y un `0` fabricado apagaría
 * una escritura real. El texto de los periodos cae al propio input crudo porque el backend lo
 * devuelve ya normalizado.
 */
export function normalizeBudgetRollover(input: unknown): BudgetRolloverResponse {
  if (!isRecord(input)) {
    return {
      fromPeriod: "",
      toPeriod: "",
      mode: "",
      dryRun: true,
      budgets: emptyRolloverCounts(),
      manualItems: emptyRolloverCounts(),
      remountedItems: emptyRolloverCounts()
    };
  }

  return {
    fromPeriod: toOptionalText(input.fromPeriod ?? input.FromPeriod) ?? "",
    toPeriod: toOptionalText(input.toPeriod ?? input.ToPeriod) ?? "",
    mode: toOptionalText(input.mode ?? input.Mode) ?? "",
    // `dryRun` ausente se resuelve como `true`: la misma regla que el backend, sin escritura.
    dryRun: toBool(input.dryRun ?? input.DryRun, true),
    budgets: normalizeRolloverCounts(input.budgets ?? input.Budgets),
    manualItems: normalizeRolloverCounts(input.manualItems ?? input.ManualItems),
    remountedItems: normalizeRolloverCounts(input.remountedItems ?? input.RemountedItems)
  };
}
