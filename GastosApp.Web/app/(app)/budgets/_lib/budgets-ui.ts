import type { BudgetPeriodStatus, BudgetUsageStatus } from "@/lib/contracts/budgets";
import type { Category } from "@/lib/contracts/categories";
import type { Subcategory } from "@/lib/contracts/subcategories";

export const BUDGETS_MODULE_META = {
  section: "Planeación",
  title: "Presupuestos"
} as const;

export type BudgetsTab = "resumen" | "alertas";

/** La URL solo distingue la pestaña de alertas; cualquier otro valor cae al resumen. */
export function resolveBudgetsTab(value: string | null | undefined): BudgetsTab {
  return value === "alertas" ? "alertas" : "resumen";
}

const badgeBase = "tabler-badge tabler-badge-solid";

const STATUS_LABELS: Record<BudgetUsageStatus, string> = {
  ok: "En rango",
  warning: "Aviso",
  exceeded: "Excedido"
};

export function budgetStatusLabel(status: BudgetUsageStatus): string {
  return STATUS_LABELS[status];
}

const STATUS_BADGES: Record<BudgetUsageStatus, string> = {
  ok: `${badgeBase} tabler-badge-success`,
  warning: `${badgeBase} tabler-badge-warning`,
  exceeded: `${badgeBase} tabler-badge-danger`
};

export function budgetStatusBadgeClass(status: BudgetUsageStatus): string {
  return STATUS_BADGES[status];
}

const STATUS_METERS: Record<BudgetUsageStatus, string> = {
  ok: "bg-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]",
  exceeded: "bg-[var(--color-danger)]"
};

export function budgetMeterClass(status: BudgetUsageStatus): string {
  return STATUS_METERS[status];
}

export function reachedThresholdBadgeClass(status: BudgetUsageStatus): string {
  return status === "exceeded" ? `${badgeBase} tabler-badge-danger` : `${badgeBase} tabler-badge-warning`;
}

export const THRESHOLD_BADGE_CLASS = "tabler-badge";

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(value)}%`;
}

/** Etiqueta legible de `yyyy-MM` sin pasar por `Date` local (evita corrimientos de zona). */
export function formatPeriodLabel(periodKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) {
    return periodKey.trim().length > 0 ? periodKey : "—";
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatDeliveryDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function deliveryStatusLabel(status: string | null): string {
  switch (status) {
    case "sent":
      return "Enviada";
    case "pending":
      return "Pendiente";
    case "failed":
      return "Fallida";
    default:
      return "Sin registro";
  }
}

export function deliveryStatusBadgeClass(status: string | null): string {
  switch (status) {
    case "sent":
      return `${badgeBase} tabler-badge-success`;
    case "pending":
      return `${badgeBase} tabler-badge-primary`;
    case "failed":
      return `${badgeBase} tabler-badge-danger`;
    default:
      return `${badgeBase} tabler-badge-muted`;
  }
}

export type BudgetCatalogIndex = {
  categoryById: Map<number, Category>;
  subcategoryById: Map<number, Subcategory>;
};

/** El API rechaza cualquier alcance que no sea de gasto: el formulario solo ofrece esas opciones. */
export function getExpenseCategories(categories: Category[]): Category[] {
  return categories.filter((category) => category.type === "expense");
}

export function getExpenseSubcategories(subcategories: Subcategory[], expenseCategoryIds: Set<number>): Subcategory[] {
  return subcategories.filter((subcategory) => expenseCategoryIds.has(subcategory.categoryId));
}

export function buildBudgetCatalogIndex(categories: Category[], subcategories: Subcategory[]): BudgetCatalogIndex {
  return {
    categoryById: new Map(categories.map((category) => [category.categoryId, category])),
    subcategoryById: new Map(subcategories.map((subcategory) => [subcategory.subcategoryId, subcategory]))
  };
}

export type BudgetScopeDescription = {
  label: string;
  hint: string | null;
};

/** El API no manda nombres de alcance: se resuelven con los catálogos ya cargados. */
export function describeBudgetScope(
  scope: { categoryId: number | null; subcategoryId: number | null },
  index: BudgetCatalogIndex
): BudgetScopeDescription {
  if (scope.subcategoryId !== null) {
    const subcategory = index.subcategoryById.get(scope.subcategoryId);
    const parent = subcategory ? index.categoryById.get(subcategory.categoryId) : undefined;

    return {
      label: subcategory?.name ?? `Subcategoría #${scope.subcategoryId}`,
      hint: parent?.name ?? "Subcategoría"
    };
  }

  if (scope.categoryId === null) {
    return { label: "Sin alcance", hint: null };
  }

  const category = index.categoryById.get(scope.categoryId);
  return {
    label: category?.name ?? `Categoría #${scope.categoryId}`,
    hint: "Incluye sus subcategorías"
  };
}

export type BudgetTotals = {
  budgeted: number;
  spent: number;
  remaining: number;
  activeCount: number;
  totalCount: number;
};

/** Los totales ignoran presupuestos inactivos: no acumulan gasto ni alertas. */
export function summarizeBudgetStatuses(statuses: BudgetPeriodStatus[]): BudgetTotals {
  const active = statuses.filter((status) => status.active);

  return active.reduce<BudgetTotals>(
    (totals, status) => ({
      ...totals,
      budgeted: totals.budgeted + status.amountMxn,
      spent: totals.spent + status.spent,
      remaining: totals.remaining + status.remaining
    }),
    {
      budgeted: 0,
      spent: 0,
      remaining: 0,
      activeCount: active.length,
      totalCount: statuses.length
    }
  );
}
