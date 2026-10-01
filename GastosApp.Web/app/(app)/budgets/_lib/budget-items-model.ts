// Solo importa tipos: el runner de pruebas (`node --experimental-strip-types --test`) no resuelve
// el alias `@/`, y un import marcado como `type` se elimina al quitar los tipos.
import type { BudgetItem, BudgetItemPatchableStatus } from "@/lib/contracts/budget-items";
import type { BudgetPeriodStatus } from "@/lib/contracts/budgets";

/**
 * Campos mínimos del desglose. Los componentes de barra solo reciben estos números, así que el
 * modelo no exige el objeto de estado completo (ni lo obliga a inventar campos que no usa).
 */
export type BudgetBreakdownInput = Pick<BudgetPeriodStatus, "amountMxn" | "spent" | "committed" | "projected">;

/** Desglose aditivo del consumo de un presupuesto, en MXN. */
export type BudgetBreakdown = {
  amountMxn: number;
  spent: number;
  committed: number;
  /** `spent + committed`: el número contra el que se mide el restante. */
  effective: number;
  projected: number;
  /** `effective + projected`. Informativo, no compromete dinero. */
  forecast: number;
  remaining: number;
};

export type BudgetComposition = {
  /** Porcentaje gastado, acotado a 100 para el ancho de la barra. */
  spentPercent: number;
  /** Porcentaje comprometido, acotado a 100. */
  committedPercent: number;
  /** Porcentaje proyectado, acotado a 100. */
  projectedPercent: number;
  /** Porcentaje total mostrado (`spent + committed`). */
  totalPercent: number;
  /** Posición de la marca de proyección, acotada a 100. */
  projectionPercent: number;
  /** `effective` excede el límite del presupuesto. */
  isOverBudget: boolean;
  /** `forecast` excede el límite: el gasto proyectado rompería el presupuesto. */
  isForecastOverBudget: boolean;
};

/** Periodo cerrado: el backend deja de comprometer y de proyectar. */
export type PeriodClosure = {
  isClosed: boolean;
  /** Partidas `pending` que caducaron sin ejecutarse. */
  unexecutedCount: number;
  /** Hay partidas `pending` reportadas por el backend. */
  hasPendingItems: boolean;
};

/**
 * Desglose de un presupuesto a partir del estado ya calculado por el backend.
 * El desglose se compone de los campos aditivos del contrato, no de `remaining` reportado:
 * así el restante siempre es coherente con `effective = spent + committed`.
 */
export function buildBudgetBreakdown(status: BudgetBreakdownInput): BudgetBreakdown {
  const amountMxn = status.amountMxn;
  const spent = status.spent;
  const committed = status.committed;
  const effective = spent + committed;
  const projected = status.projected;

  return {
    amountMxn,
    spent,
    committed,
    effective,
    projected,
    forecast: effective + projected,
    // "Total restante" se mide contra `effective`, nunca contra `spent`.
    remaining: amountMxn - effective
  };
}

export function buildBudgetComposition(status: BudgetBreakdownInput): BudgetComposition {
  const breakdown = buildBudgetBreakdown(status);

  const spentPercent = breakdown.amountMxn > 0 ? (breakdown.spent / breakdown.amountMxn) * 100 : 0;
  const committedPercent = breakdown.amountMxn > 0 ? (breakdown.committed / breakdown.amountMxn) * 100 : 0;
  const projectedPercent = breakdown.amountMxn > 0 ? (breakdown.projected / breakdown.amountMxn) * 100 : 0;

  return {
    spentPercent,
    committedPercent,
    projectedPercent,
    totalPercent: spentPercent + committedPercent,
    projectionPercent: spentPercent + committedPercent + projectedPercent,
    isOverBudget: breakdown.effective > breakdown.amountMxn,
    isForecastOverBudget: breakdown.forecast > breakdown.amountMxn
  };
}

/**
 * Un periodo está abierto cuando es el mes en curso o uno futuro. Réplica de
 * `MonthRangeResolver.IsPeriodOpen`: comparación ordinal/lexicográfica, válida porque
 * `yyyy-MM` está rellenado con ceros. Al cerrar el mes, `committed`/`projected` llegan en cero.
 */
export function isOpenPeriod(periodKey: string, currentPeriodKey: string): boolean {
  if (periodKey.trim().length === 0 || currentPeriodKey.trim().length === 0) {
    return false;
  }

  return periodKey >= currentPeriodKey;
}

export function isClosedPeriod(periodKey: string, currentPeriodKey: string): boolean {
  return !isOpenPeriod(periodKey, currentPeriodKey);
}

/**
 * El cierre no se puede inferir del estado: un mes abierto sin partidas también trae
 * `committed` y `projected` en cero. Se decide por periodo; los conteos solo explican
 * qué quedó pendiente (en periodo cerrado `itemsUnexecuted` refleja las `pending` caducadas).
 */
export function describePeriodClosure(status: Pick<BudgetPeriodStatus, "periodKey" | "itemsPending" | "itemsUnexecuted">, currentPeriodKey: string): PeriodClosure {
  return {
    isClosed: isClosedPeriod(status.periodKey, currentPeriodKey),
    unexecutedCount: status.itemsUnexecuted,
    hasPendingItems: status.itemsPending > 0
  };
}

/** Acciones destructivas o de transición que el backend rechaza con 409 o 400. */
export type BudgetItemActions = {
  /** `PUT /api/budget-items/{id}`. En `executed` y `cancelled` no se puede editar. */
  canEdit: boolean;
  /** `PATCH /api/budget-items/{id}/status`: hay alguna transición de estado ofrecible. */
  canChangeStatus: boolean;
  /** `POST /api/budget-items/{id}/cancel`. */
  canCancel: boolean;
  /** Transiciones ofrecidas por el menú, sin incluir el estado actual. */
  availableStatuses: BudgetItemPatchableStatus[];
  /** Motivo a mostrar cuando no hay acciones: `executed` y `cancelled` son terminales. */
  terminalReason: string | null;
};

/**
 * `executed` es terminal: volver a `pending`/`ignored`, cancelar o mover de mes devuelve 409.
 * `cancelled` es terminal y solo se alcanza por el endpoint de cancelación. En ambos casos la UI
 * deshabilita las acciones en lugar de dejar que el usuario choque con el conflicto.
 *
 * `executed` NO se ofrece como transición manual ni desde `pending` ni desde `ignored`: exige una
 * transacción ya enlazada y el backend responde 400 si no existe.
 */
export function getItemActions(status: string): BudgetItemActions {
  if (status === "executed") {
    return {
      canEdit: false,
      canChangeStatus: false,
      canCancel: false,
      availableStatuses: [],
      terminalReason: "Partida ejecutada: no admite cambios de estado ni cancelación"
    };
  }

  if (status === "cancelled") {
    return {
      canEdit: false,
      canChangeStatus: false,
      canCancel: false,
      availableStatuses: [],
      terminalReason: "Partida cancelada"
    };
  }

  if (status === "pending") {
    return {
      canEdit: true,
      canChangeStatus: true,
      canCancel: true,
      availableStatuses: ["ignored"],
      terminalReason: null
    };
  }

  if (status === "ignored") {
    return {
      canEdit: true,
      canChangeStatus: true,
      canCancel: true,
      availableStatuses: ["pending"],
      terminalReason: null
    };
  }

  // Estado desconocido: no se inventan acciones que el backend podría rechazar.
  return {
    canEdit: false,
    canChangeStatus: false,
    canCancel: false,
    availableStatuses: [],
    terminalReason: null
  };
}

/** Filtro de la pestaña de partidas: `all` no recorta nada. */
export type BudgetItemKindFilter = "all" | "expense" | "income";

export function filterItemsByKind(items: BudgetItem[], filter: BudgetItemKindFilter): BudgetItem[] {
  if (filter === "all") {
    return items;
  }

  return items.filter((item) => item.kind === filter);
}

/** Etiqueta legible para `kind`/`status` sin mostrar el valor crudo del backend. */
export function budgetItemKindLabel(kind: string): string {
  if (kind === "income") return "Ingreso";
  if (kind === "expense") return "Gasto";
  return kind.trim().length > 0 ? kind : "Sin tipo";
}

export function budgetItemStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "executed":
      return "Ejecutada";
    case "ignored":
      return "Ignorada";
    case "cancelled":
      return "Cancelada";
    default:
      return status.trim().length > 0 ? status : "Sin estado";
  }
}

const ITEM_BADGE_BASE = "tabler-badge tabler-badge-solid";

export function budgetItemStatusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
      return `${ITEM_BADGE_BASE} tabler-badge-warning`;
    case "executed":
      return `${ITEM_BADGE_BASE} tabler-badge-success`;
    case "ignored":
      return `${ITEM_BADGE_BASE} tabler-badge-muted`;
    case "cancelled":
      return `${ITEM_BADGE_BASE} tabler-badge-danger`;
    default:
      return `${ITEM_BADGE_BASE} tabler-badge-muted`;
  }
}

export function budgetItemKindBadgeClass(kind: string): string {
  return kind === "income" ? `${ITEM_BADGE_BASE} tabler-badge-success` : `${ITEM_BADGE_BASE} tabler-badge-primary`;
}
