import type { BudgetPeriodStatus, BudgetThreshold } from "@/lib/contracts/budgets";
import type {
  BudgetCreatePayload,
  BudgetScopeType,
  BudgetThresholdPayload,
  BudgetUpdatePayload
} from "./budgets-api";

export type BudgetThresholdFormValue = {
  key: string;
  name: string;
  percent: string;
  active: boolean;
};

export type BudgetFormValues = {
  name: string;
  scopeType: BudgetScopeType;
  categoryId: number | null;
  subcategoryId: number | null;
  amountMxn: string;
  thresholds: BudgetThresholdFormValue[];
};

export type BudgetFormErrors = Partial<Record<"name" | "scope" | "amountMxn" | "thresholds", string>>;

export const MAX_BUDGET_THRESHOLDS = 10;

/** `budget_thresholds.name` es `VARCHAR(60)`; se valida aquí para no depender del 400 del API. */
export const MAX_THRESHOLD_NAME_LENGTH = 60;

const DEFAULT_THRESHOLD_ROWS: ReadonlyArray<Omit<BudgetThresholdFormValue, "key">> = [
  { name: "Aviso", percent: "80", active: true },
  { name: "Límite", percent: "100", active: true }
];

function rowKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function defaultThresholdRows(): BudgetThresholdFormValue[] {
  return DEFAULT_THRESHOLD_ROWS.map((row) => ({ ...row, key: rowKey() }));
}

function toThresholdRow(threshold: BudgetThreshold): BudgetThresholdFormValue {
  return {
    key: `threshold-${threshold.thresholdId}`,
    name: threshold.name,
    percent: String(threshold.percent),
    active: threshold.active
  };
}

/** `null` cuando el texto no es un número válido; los importes se redondean a 2 decimales como el API. */
export function parseFormNumber(value: string): number | null {
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

export function createEmptyBudgetForm(): BudgetFormValues {
  return {
    name: "",
    scopeType: "category",
    categoryId: null,
    subcategoryId: null,
    amountMxn: "",
    thresholds: defaultThresholdRows()
  };
}

export function toBudgetFormValues(status: BudgetPeriodStatus, thresholds: BudgetThreshold[]): BudgetFormValues {
  return {
    name: status.name,
    scopeType: status.subcategoryId !== null ? "subcategory" : "category",
    categoryId: status.categoryId,
    subcategoryId: status.subcategoryId,
    amountMxn: String(status.amountMxn),
    thresholds: thresholds.length > 0 ? thresholds.map(toThresholdRow) : defaultThresholdRows()
  };
}

export function addThresholdRow(rows: BudgetThresholdFormValue[]): BudgetThresholdFormValue[] {
  return [...rows, { key: rowKey(), name: "", percent: "", active: true }];
}

export function removeThresholdRow(rows: BudgetThresholdFormValue[], key: string): BudgetThresholdFormValue[] {
  return rows.filter((row) => row.key !== key);
}

export function patchThresholdRow(
  rows: BudgetThresholdFormValue[],
  key: string,
  patch: Partial<Omit<BudgetThresholdFormValue, "key">>
): BudgetThresholdFormValue[] {
  return rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

export function validateBudgetForm(values: BudgetFormValues): BudgetFormErrors {
  const errors: BudgetFormErrors = {};

  const name = values.name.trim();
  if (!name) {
    errors.name = "Nombre requerido";
  } else if (name.length > 120) {
    errors.name = "Máximo 120 caracteres";
  }

  const amount = parseFormNumber(values.amountMxn);
  if (amount === null || amount <= 0) {
    errors.amountMxn = "Monto mayor a 0";
  }

  if (values.scopeType === "category" && values.categoryId === null) {
    errors.scope = "Selecciona una categoría";
  }

  if (values.scopeType === "subcategory" && values.subcategoryId === null) {
    errors.scope = "Selecciona una subcategoría";
  }

  if (values.thresholds.length === 0) {
    errors.thresholds = "Agrega al menos un umbral";
  } else if (values.thresholds.length > MAX_BUDGET_THRESHOLDS) {
    errors.thresholds = `Máximo ${MAX_BUDGET_THRESHOLDS} umbrales`;
  } else {
    const usedPercents = new Set<number>();
    for (const threshold of values.thresholds) {
      const thresholdName = threshold.name.trim();
      if (!thresholdName) {
        errors.thresholds = "Cada umbral necesita un nombre";
        break;
      }

      if (thresholdName.length > MAX_THRESHOLD_NAME_LENGTH) {
        errors.thresholds = `El nombre del umbral no puede exceder ${MAX_THRESHOLD_NAME_LENGTH} caracteres`;
        break;
      }

      const percent = parseFormNumber(threshold.percent);
      if (percent === null || percent <= 0 || percent > 999.99) {
        errors.thresholds = "Los umbrales deben estar entre 0.01% y 999.99%";
        break;
      }

      if (usedPercents.has(percent)) {
        errors.thresholds = "Dos umbrales no pueden compartir el mismo porcentaje";
        break;
      }

      usedPercents.add(percent);
    }
  }

  return errors;
}

export function toThresholdPayload(values: BudgetFormValues): BudgetThresholdPayload[] {
  return values.thresholds
    .map((row) => ({
      name: row.name.trim(),
      percent: parseFormNumber(row.percent) ?? 0,
      active: row.active
    }))
    .sort((a, b) => a.percent - b.percent);
}

export function toBudgetCreatePayload(values: BudgetFormValues, periodKey: string): BudgetCreatePayload {
  const useCategory = values.scopeType === "category";

  return {
    periodKey,
    name: values.name.trim(),
    categoryId: useCategory ? values.categoryId : null,
    subcategoryId: useCategory ? null : values.subcategoryId,
    amountMxn: parseFormNumber(values.amountMxn) ?? 0,
    active: true,
    thresholds: toThresholdPayload(values)
  };
}

export function toBudgetUpdatePayload(values: BudgetFormValues, active: boolean): BudgetUpdatePayload {
  const useCategory = values.scopeType === "category";

  return {
    name: values.name.trim(),
    categoryId: useCategory ? values.categoryId : null,
    subcategoryId: useCategory ? null : values.subcategoryId,
    amountMxn: parseFormNumber(values.amountMxn) ?? 0,
    active
  };
}

/**
 * Los umbrales se comparan por porcentaje (la llave que usa el API para conservar el historial
 * ya notificado). Solo se envía el reemplazo si algo cambió, para no tocar entregas existentes.
 */
export function thresholdsChanged(original: BudgetThreshold[], values: BudgetFormValues): boolean {
  const before = [...original]
    .map((threshold) => ({ name: threshold.name.trim(), percent: threshold.percent, active: threshold.active }))
    .sort((a, b) => a.percent - b.percent);
  const after = toThresholdPayload(values);

  return JSON.stringify(before) !== JSON.stringify(after);
}
