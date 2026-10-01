import type { BudgetItem } from "@/lib/contracts/budget-items";
import type { PlanItemVariance, PlanSummary } from "@/lib/contracts/plan";

/** Desglose del plan del periodo en MXN. Ningún campo mezcla gasto con ingreso. */
export type PlanTotals = {
  /** Límites sumados de los presupuestos activos. */
  budgeted: number;
  spent: number;
  committed: number;
  projected: number;
  /** `spent + committed`: el número contra el que se mide el restante. */
  effective: number;
  forecast: number;
  /** `budgeted − effective` sobre los presupuestos activos. */
  remaining: number;
  spentPercent: number;
  committedPercent: number;
  totalPercent: number;
  activeBudgets: number;
  totalBudgets: number;
};

/** Conteos de partidas del periodo, tal como los reporta el backend por presupuesto. */
export type PlanItemCounts = {
  pending: number;
  executed: number;
  /** Partidas `pending` de un periodo cerrado: caducaron sin ejecutarse. */
  unexecuted: number;
  ignored: number;
  /** `pending + executed + ignored`: no incluye `cancelled`, que libera su monto. */
  total: number;
};

/** Variación de las desviaciones del plan, útil para resumir sin listar cada partida. */
export type VarianceSummary = {
  count: number;
  /** Suma de `plannedAmount − executedAmount`. Positivo = se gastó menos de lo planeado. */
  netVariance: number;
  /** Partidas ejecutadas por encima de lo planeado. */
  overPlannedCount: number;
  /** Partidas ejecutadas por debajo de lo planeado. */
  underPlannedCount: number;
  /** Mayor desviación negativa (sobrecosto), o `null` si ninguna partida se pasó. */
  worstVariance: PlanItemVariance | null;
};

export type PlanIncomeTotals = {
  plannedIncome: number;
  committedIncome: number;
  projectedIncome: number;
  executedIncome: number;
  /** `plannedIncome − executedIncome`: cuánto ingreso planificado sigue sin ejecutarse. */
  pendingIncome: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentOf(value: number, amount: number): number {
  if (amount <= 0) {
    return 0;
  }

  return roundMoney((value / amount) * 100);
}

/**
 * Totales del resumen. Solo los presupuestos **activos** acumulan gasto, igual que
 * `summarizeBudgetStatuses`; los inactivos se cuentan pero no suman.
 * "Total restante" se mide contra `effective`, nunca contra `spent`.
 */
export function summarizePlanTotals(summary: PlanSummary): PlanTotals {
  const active = summary.budgets.filter((budget) => budget.active);

  const totals = active.reduce(
    (acc, budget) => ({
      budgeted: acc.budgeted + budget.amountMxn,
      spent: acc.spent + budget.spent,
      committed: acc.committed + budget.committed,
      projected: acc.projected + budget.projected
    }),
    { budgeted: 0, spent: 0, committed: 0, projected: 0 }
  );

  const effective = roundMoney(totals.spent + totals.committed);
  const forecast = roundMoney(effective + totals.projected);

  return {
    budgeted: roundMoney(totals.budgeted),
    spent: roundMoney(totals.spent),
    committed: roundMoney(totals.committed),
    projected: roundMoney(totals.projected),
    effective,
    forecast,
    remaining: roundMoney(totals.budgeted - effective),
    spentPercent: percentOf(totals.spent, totals.budgeted),
    committedPercent: percentOf(totals.committed, totals.budgeted),
    totalPercent: percentOf(effective, totals.budgeted),
    activeBudgets: active.length,
    totalBudgets: summary.budgets.length
  };
}

export function summarizePlanItemCounts(summary: PlanSummary): PlanItemCounts {
  const counts = summary.budgets.reduce(
    (acc, budget) => ({
      pending: acc.pending + budget.itemsPending,
      executed: acc.executed + budget.itemsExecuted,
      unexecuted: acc.unexecuted + budget.itemsUnexecuted,
      ignored: acc.ignored + budget.itemsIgnored
    }),
    { pending: 0, executed: 0, unexecuted: 0, ignored: 0 }
  );

  return {
    ...counts,
    total: counts.pending + counts.executed + counts.ignored
  };
}

/**
 * Las desviaciones solo existen para partidas ejecutadas: `plannedAmount − executedAmount`.
 * Un neto positivo significa que se gastó menos de lo planeado.
 */
export function summarizeVariances(variances: PlanItemVariance[]): VarianceSummary {
  let netVariance = 0;
  let overPlannedCount = 0;
  let underPlannedCount = 0;
  let worstVariance: PlanItemVariance | null = null;

  for (const variance of variances) {
    netVariance += variance.variance;

    if (variance.variance < 0) {
      overPlannedCount += 1;
      if (worstVariance === null || variance.variance < worstVariance.variance) {
        worstVariance = variance;
      }
    } else if (variance.variance > 0) {
      underPlannedCount += 1;
    }
  }

  return {
    count: variances.length,
    netVariance: roundMoney(netVariance),
    overPlannedCount,
    underPlannedCount,
    worstVariance
  };
}

export function summarizePlanIncome(summary: PlanSummary): PlanIncomeTotals {
  return {
    plannedIncome: summary.plannedIncome,
    committedIncome: summary.committedIncome,
    projectedIncome: summary.projectedIncome,
    executedIncome: summary.executedIncome,
    pendingIncome: roundMoney(summary.plannedIncome - summary.executedIncome)
  };
}

/**
 * Partidas sin presupuesto asignado. Pueden venir de presupuestos cerrados sin partidas
 * `cancelled`; su alcance se resuelve con los catálogos ya cargados en la vista.
 *
 * Una partida sin fecha se ordena al final: comparar la cadena vacía la pondría primero,
 * y en un plan de periodo lo que no tiene fecha es justamente lo que falta por planificar.
 */
export function sortPlanItems(items: BudgetItem[]): BudgetItem[] {
  return [...items].sort((a, b) => {
    const dateA = a.plannedDate ?? "";
    const dateB = b.plannedDate ?? "";

    if (dateA !== dateB) {
      if (dateA === "") return 1;
      if (dateB === "") return -1;
      return dateA < dateB ? -1 : 1;
    }

    return a.name.localeCompare(b.name, "es-MX");
  });
}

/** Un resumen sin presupuestos ni partidas: la UI lo usa para el estado vacío. */
export function isPlanSummaryEmpty(summary: PlanSummary): boolean {
  return (
    summary.budgets.length === 0 &&
    summary.itemsWithoutBudget.length === 0 &&
    summary.variances.length === 0 &&
    summary.accountFlows.length === 0
  );
}
