// Import relativo con `.ts` (como `budget-item-form-model.ts`): el runner de pruebas
// (`node --experimental-strip-types --test`) no resuelve el alias `@/`. Los tipos de los catálogos sí
// viajan por `@/` porque un import marcado como `type` se elimina al quitar los tipos.
import { toDateInputValue, type BudgetItemSuggestion } from "../../../../lib/contracts/budget-items.ts";
import type { Category } from "@/lib/contracts/categories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { Subcategory } from "@/lib/contracts/subcategories";
import type { Account } from "@/lib/contracts/accounts";
import { budgetItemKindBadgeClass, budgetItemKindLabel } from "./budget-items-model.ts";

/**
 * Catálogos ya cargados por el hook de partidas: la sugerencia trae ids, no nombres, y no se pide
 * nada extra para resolverlos. `ReadonlyMap` porque este módulo solo lee.
 */
export type SuggestionCatalogs = {
  categoryById: ReadonlyMap<number, Pick<Category, "categoryId" | "name">>;
  subcategoryById: ReadonlyMap<number, Pick<Subcategory, "subcategoryId" | "categoryId" | "name">>;
  accountById: ReadonlyMap<number, Pick<Account, "accountId" | "name">>;
  merchantById: ReadonlyMap<number, Pick<Merchant, "merchantId" | "name">>;
};

/** Orden de lectura: primero la fecha de la partida, luego la cercanía del par y el id como desempate. */
export function sortBudgetItemSuggestions(suggestions: BudgetItemSuggestion[]): BudgetItemSuggestion[] {
  return [...suggestions].sort((left, right) => {
    // Sin fecha la sugerencia va al final en vez de ganar el orden por tener "".
    const byDate = compareDates(left.plannedDate, right.plannedDate);
    if (byDate !== 0) {
      return byDate;
    }

    if (left.distanceDays !== right.distanceDays) {
      return left.distanceDays - right.distanceDays;
    }

    return left.itemId - right.itemId;
  });
}

function compareDates(left: string | null, right: string | null): number {
  const leftDate = toDateInputValue(left);
  const rightDate = toDateInputValue(right);

  if (leftDate === rightDate) {
    return 0;
  }

  if (leftDate.length === 0) {
    return 1;
  }

  if (rightDate.length === 0) {
    return -1;
  }

  return leftDate < rightDate ? -1 : 1;
}

export type SuggestionScopeDescription = {
  label: string;
  hint: string | null;
};

/**
 * Alcance de la partida resuelto con los catálogos en mano. Si el catálogo aún no llegó, se muestra
 * el id como respaldo: es preferible un `#12` honesto a un nombre inventado.
 */
export function describeSuggestionScope(suggestion: BudgetItemSuggestion, catalogs: SuggestionCatalogs): SuggestionScopeDescription {
  if (suggestion.subcategoryId !== null) {
    const subcategory = catalogs.subcategoryById.get(suggestion.subcategoryId);
    const parent = subcategory ? catalogs.categoryById.get(subcategory.categoryId) : undefined;

    return {
      label: subcategory?.name ?? `Subcategoría #${suggestion.subcategoryId}`,
      hint: parent?.name ?? "Subcategoría"
    };
  }

  if (suggestion.categoryId === null) {
    return { label: "Sin alcance", hint: null };
  }

  const category = catalogs.categoryById.get(suggestion.categoryId);
  return {
    label: category?.name ?? `Categoría #${suggestion.categoryId}`,
    hint: "Categoría"
  };
}

export type SuggestionContextDescription = {
  account: string | null;
  merchant: string | null;
};

/** Cuenta y comercio de la partida. El endpoint no manda esos nombres: salen de los catálogos. */
export function describeSuggestionContext(suggestion: BudgetItemSuggestion, catalogs: SuggestionCatalogs): SuggestionContextDescription {
  const account = suggestion.accountId === null ? null : catalogs.accountById.get(suggestion.accountId)?.name ?? null;

  return {
    account,
    merchant: suggestion.merchantId === null ? null : catalogs.merchantById.get(suggestion.merchantId)?.name ?? null
  };
}

/** La fuerza de la coincidencia se dice con palabras, no solo con el color del badge. */
export function suggestionStrengthLabel(strength: string): string {
  switch (strength) {
    case "weak":
      return "Coincidencia débil";
    default:
      return strength.trim().length > 0 ? strength : "Sin fuerza definida";
  }
}

const SUGGESTION_BADGE_BASE = "tabler-badge tabler-badge-solid";

export function suggestionStrengthBadgeClass(strength: string): string {
  return strength === "weak" ? `${SUGGESTION_BADGE_BASE} tabler-badge-warning` : `${SUGGESTION_BADGE_BASE} tabler-badge-muted`;
}

export function suggestionKindLabel(kind: string): string {
  return budgetItemKindLabel(kind);
}

export function suggestionKindBadgeClass(kind: string): string {
  return budgetItemKindBadgeClass(kind);
}

/** Separación en días entre partida y transacción, en palabras y sin depender del color. */
export function suggestionDistanceLabel(distanceDays: number): string {
  const days = Number.isFinite(distanceDays) ? Math.max(0, Math.round(distanceDays)) : 0;

  if (days === 0) {
    return "Mismo día";
  }

  return days === 1 ? "1 día de distancia" : `${days} días de distancia`;
}

/**
 * `plannedDate` es una columna `DATE` (`yyyy-MM-ddT00:00:00`): se recorta el prefijo y se formatea
 * en UTC para no correr el día, igual que en la tabla de partidas.
 */
export function formatPlannedDateLabel(value: string | null): string {
  const iso = toDateInputValue(value);
  if (!iso) {
    return "—";
  }

  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}

/**
 * `transactionDate` llega como fecha local del backend (sin zona ni sufijo `Z`): interpretarla como
 * local y formatearla en la zona del navegador conserva la hora de captura, que es la que importa
 * para comparar dos capturas cercanas.
 */
export function formatTransactionDateLabel(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

/** Una fila por par: la misma partida o la misma transacción no se repite. */
export function suggestionRowKey(suggestion: BudgetItemSuggestion): string {
  return `${suggestion.itemId}:${suggestion.transactionId}`;
}