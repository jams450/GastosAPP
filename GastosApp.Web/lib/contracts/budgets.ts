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

export type BudgetPeriodStatus = {
  budgetId: number;
  name: string;
  periodKey: string;
  categoryId: number | null;
  subcategoryId: number | null;
  active: boolean;
  amountMxn: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  status: BudgetUsageStatus;
  reachedThreshold: BudgetReachedThreshold | null;
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
    remaining: toFiniteNumber(input.remaining ?? input.Remaining),
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
