// El alias `@/` no lo resuelve `node --experimental-strip-types --test`, y este módulo se prueba
// directa e indirectamente: los imports de valor van con ruta relativa y extensión explícita.
import { normalizeBudgetItem, type BudgetItem } from "./budget-items.ts";
import { normalizeBudgetStatus, type BudgetPeriodStatus } from "./budgets.ts";

type UnknownRecord = Record<string, unknown>;

/** Desviación de una partida ejecutada: `plannedAmount − executedAmount`. */
export type PlanItemVariance = {
  itemId: number;
  name: string;
  kind: string;
  plannedAmount: number;
  executedAmount: number;
  variance: number;
};

/** Suma de lo planificado por cuenta. No es un saldo proyectado. */
export type PlanAccountFlow = {
  accountId: number;
  plannedExpense: number;
  plannedIncome: number;
  itemCount: number;
};

/**
 * Vista consolidada del plan de un periodo. Reutiliza el contrato de `budgets/status` para el
 * desglose por presupuesto: el backend mapea exactamente el mismo `BudgetStatusResponse`.
 */
export type PlanSummary = {
  periodKey: string;
  budgets: BudgetPeriodStatus[];
  plannedIncome: number;
  committedIncome: number;
  projectedIncome: number;
  executedIncome: number;
  variances: PlanItemVariance[];
  itemsWithoutBudget: BudgetItem[];
  accountFlows: PlanAccountFlow[];
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

function toText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizePlanItemVariance(input: unknown): PlanItemVariance | null {
  if (!isRecord(input)) {
    return null;
  }

  const itemId = toOptionalInt(input.itemId ?? input.ItemId);
  if (itemId === null || itemId <= 0) {
    return null;
  }

  return {
    itemId,
    name: toText(input.name ?? input.Name, "Sin nombre"),
    kind: toText(input.kind ?? input.Kind, ""),
    plannedAmount: toFiniteNumber(input.plannedAmount ?? input.PlannedAmount),
    executedAmount: toFiniteNumber(input.executedAmount ?? input.ExecutedAmount),
    variance: toFiniteNumber(input.variance ?? input.Variance)
  };
}

function normalizePlanItemVariances(input: unknown): PlanItemVariance[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizePlanItemVariance(item)).filter((item): item is PlanItemVariance => item !== null);
}

function normalizePlanAccountFlow(input: unknown): PlanAccountFlow | null {
  if (!isRecord(input)) {
    return null;
  }

  const accountId = toOptionalInt(input.accountId ?? input.AccountId);
  if (accountId === null || accountId <= 0) {
    return null;
  }

  return {
    accountId,
    plannedExpense: toFiniteNumber(input.plannedExpense ?? input.PlannedExpense),
    plannedIncome: toFiniteNumber(input.plannedIncome ?? input.PlannedIncome),
    itemCount: toOptionalInt(input.itemCount ?? input.ItemCount) ?? 0
  };
}

function normalizePlanAccountFlows(input: unknown): PlanAccountFlow[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizePlanAccountFlow(item)).filter((item): item is PlanAccountFlow => item !== null);
}

function normalizeBudgetList(input: unknown): BudgetPeriodStatus[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeBudgetStatus(item))
    .filter((item): item is BudgetPeriodStatus => item !== null);
}

function normalizeItemList(input: unknown): BudgetItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizeBudgetItem(item)).filter((item): item is BudgetItem => item !== null);
}

export function normalizePlanSummary(input: unknown): PlanSummary | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    periodKey: typeof (input.periodKey ?? input.PeriodKey) === "string" ? String(input.periodKey ?? input.PeriodKey).trim() : "",
    budgets: normalizeBudgetList(input.budgets ?? input.Budgets),
    plannedIncome: toFiniteNumber(input.plannedIncome ?? input.PlannedIncome),
    committedIncome: toFiniteNumber(input.committedIncome ?? input.CommittedIncome),
    projectedIncome: toFiniteNumber(input.projectedIncome ?? input.ProjectedIncome),
    executedIncome: toFiniteNumber(input.executedIncome ?? input.ExecutedIncome),
    variances: normalizePlanItemVariances(input.variances ?? input.Variances),
    itemsWithoutBudget: normalizeItemList(input.itemsWithoutBudget ?? input.ItemsWithoutBudget),
    accountFlows: normalizePlanAccountFlows(input.accountFlows ?? input.AccountFlows)
  };
}
