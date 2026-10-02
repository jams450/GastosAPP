type UnknownRecord = Record<string, unknown>;

export const BUDGET_ITEM_KINDS = ["income", "expense"] as const;
export const BUDGET_ITEM_STATUSES = ["pending", "executed", "ignored", "cancelled"] as const;
export const BUDGET_ITEM_SOURCES = ["manual", "template"] as const;

/** Todos los estados que el backend puede devolver: cerrado por tipo, sin valores libres. */
export const BUDGET_ITEM_ALL_STATUSES = BUDGET_ITEM_STATUSES;

/**
 * Estados que acepta `PATCH /api/budget-items/{id}/status`. `cancelled` viaja aparte
 * (`POST .../cancel`), porque esa transición libera el monto de forma explícita.
 */
export const BUDGET_ITEM_PATCHABLE_STATUSES = ["pending", "executed", "ignored"] as const;

export type BudgetItemKind = (typeof BUDGET_ITEM_KINDS)[number];
export type BudgetItemStatus = (typeof BUDGET_ITEM_STATUSES)[number];
export type BudgetItemSource = (typeof BUDGET_ITEM_SOURCES)[number];
export type BudgetItemPatchableStatus = (typeof BUDGET_ITEM_PATCHABLE_STATUSES)[number];

export function isBudgetItemKind(value: string): value is BudgetItemKind {
  return (BUDGET_ITEM_KINDS as readonly string[]).includes(value);
}

export function isBudgetItemStatus(value: string): value is BudgetItemStatus {
  return (BUDGET_ITEM_STATUSES as readonly string[]).includes(value);
}

export function isBudgetItemPatchableStatus(value: string): value is BudgetItemPatchableStatus {
  return (BUDGET_ITEM_PATCHABLE_STATUSES as readonly string[]).includes(value);
}

/**
 * Partida planificada del mes. `status` y `kind` se conservan como texto crudo para no fabricar
 * una categoría del dominio que el backend no reconozca; `isBudgetItemStatus` y `isBudgetItemKind`
 * son los guardas para estrechar el tipo cuando importa.
 */
export type BudgetItem = {
  itemId: number;
  periodKey: string;
  kind: string;
  name: string;
  plannedAmount: number;
  plannedDate: string | null;
  categoryId: number | null;
  subcategoryId: number | null;
  accountId: number | null;
  merchantId: number | null;
  recurringItemId: number | null;
  status: string;
  isProjected: boolean;
  transactionId: number | null;
  source: string;
  notes: string | null;
  created: string | null;
  updated: string | null;
};

/**
 * Alta o edición de partida. `periodKey` no viaja: el backend lo deriva de `plannedDate`, y en
 * edición `kind` es inmutable (el backend responde 400 si cambia).
 *
 * `recurringItemId` solo se envía en el alta selectiva desde programada: con valor, el backend
 * deriva nombre/tipo/monto/fecha/alcance de la plantilla y liga la partida (`source=template`).
 * `null` = alta manual, comportamiento intacto.
 */
export type BudgetItemWriteRequest = {
  kind: string;
  name: string;
  plannedAmount: number;
  plannedDate: string;
  categoryId: number | null;
  subcategoryId: number | null;
  accountId: number | null;
  merchantId: number | null;
  notes: string | null;
  recurringItemId: number | null;
};

export type BudgetItemStatusRequest = {
  status: BudgetItemPatchableStatus;
};

/** Resultado de la purga de partidas canceladas de un periodo. */
export type BudgetItemPurgeResult = {
  periodKey: string;
  deleted: number;
};

/**
 * Par candidato a enlace entre una partida `pending` y una transacción del mismo periodo.
 *
 * `strength` se conserva como texto crudo (igual que `BudgetItem.status`): hoy el backend solo
 * emite `weak`, pero una fuerza futura debe aparecer tal cual y no disfrazarse de la de hoy.
 * `distanceDays` es la separación en días entre la fecha de la partida y la de la transacción: no
 * la calcula el frontend, viene del backend.
 */
export type BudgetItemSuggestion = {
  itemId: number;
  periodKey: string;
  kind: string;
  name: string;
  plannedAmount: number;
  plannedDate: string | null;
  categoryId: number | null;
  subcategoryId: number | null;
  accountId: number | null;
  merchantId: number | null;
  transactionId: number;
  transactionAmount: number;
  transactionDate: string | null;
  distanceDays: number;
  strength: string;
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

/** Días de separación entre partida y transacción: entero ≥ 0. Un valor ilegible se trata como 0. */
function toDayDistance(value: unknown): number {
  return Math.max(0, Math.round(toFiniteNumber(value)));
}

/**
 * `planned_date` es una columna `DATE`: el backend la serializa como `yyyy-MM-ddT00:00:00`.
 * Un `<input type="date">` solo acepta `yyyy-MM-dd`, y cortar el prefijo es seguro porque la
 * fecha viene sin zona.
 */
export function toDateInputValue(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : "";
}

export function normalizeBudgetItem(input: unknown): BudgetItem | null {
  if (!isRecord(input)) {
    return null;
  }

  const itemId = toOptionalInt(input.itemId ?? input.ItemId);
  if (itemId === null || itemId <= 0) {
    return null;
  }

  return {
    itemId,
    periodKey: typeof (input.periodKey ?? input.PeriodKey) === "string" ? String(input.periodKey ?? input.PeriodKey).trim() : "",
    kind: toText(input.kind ?? input.Kind, ""),
    name: toText(input.name ?? input.Name, "Sin nombre"),
    plannedAmount: toFiniteNumber(input.plannedAmount ?? input.PlannedAmount),
    plannedDate: toOptionalText(input.plannedDate ?? input.PlannedDate),
    categoryId: toOptionalInt(input.categoryId ?? input.CategoryId),
    subcategoryId: toOptionalInt(input.subcategoryId ?? input.SubcategoryId),
    accountId: toOptionalInt(input.accountId ?? input.AccountId),
    merchantId: toOptionalInt(input.merchantId ?? input.MerchantId),
    recurringItemId: toOptionalInt(input.recurringItemId ?? input.RecurringItemId),
    status: toText(input.status ?? input.Status, ""),
    isProjected: toBool(input.isProjected ?? input.IsProjected),
    transactionId: toOptionalInt(input.transactionId ?? input.TransactionId),
    source: toText(input.source ?? input.Source, ""),
    notes: toOptionalText(input.notes ?? input.Notes),
    created: toOptionalText(input.created ?? input.Created),
    updated: toOptionalText(input.updated ?? input.Updated)
  };
}

export function normalizeBudgetItems(input: unknown): BudgetItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizeBudgetItem(item)).filter((item): item is BudgetItem => item !== null);
}

export function normalizeBudgetItemPurgeResult(input: unknown): BudgetItemPurgeResult | null {
  if (!isRecord(input)) {
    return null;
  }

  const deleted = toOptionalInt(input.deleted ?? input.Deleted);
  if (deleted === null || deleted < 0) {
    return null;
  }

  return {
    periodKey: toText(input.periodKey ?? input.PeriodKey, ""),
    deleted
  };
}

/**
 * Los `int?` del backend viajan como `undefined` cuando son nulos (`WhenWritingNull`), nunca como
 * `null`: `toOptionalInt` cubre los dos casos sin inventar un `0`.
 */
export function normalizeBudgetItemSuggestion(input: unknown): BudgetItemSuggestion | null {
  if (!isRecord(input)) {
    return null;
  }

  const itemId = toOptionalInt(input.itemId ?? input.ItemId);
  const transactionId = toOptionalInt(input.transactionId ?? input.TransactionId);
  // Sin la identidad de la partida o de la transacción el par no se puede comparar ni mostrar:
  // la fila se descarta en vez de inventar un enlace que el backend nunca propuso.
  if (itemId === null || itemId <= 0 || transactionId === null || transactionId <= 0) {
    return null;
  }

  return {
    itemId,
    periodKey: typeof (input.periodKey ?? input.PeriodKey) === "string" ? String(input.periodKey ?? input.PeriodKey).trim() : "",
    kind: toText(input.kind ?? input.Kind, ""),
    name: toText(input.name ?? input.Name, "Sin nombre"),
    plannedAmount: toFiniteNumber(input.plannedAmount ?? input.PlannedAmount),
    plannedDate: toOptionalText(input.plannedDate ?? input.PlannedDate),
    categoryId: toOptionalInt(input.categoryId ?? input.CategoryId),
    subcategoryId: toOptionalInt(input.subcategoryId ?? input.SubcategoryId),
    accountId: toOptionalInt(input.accountId ?? input.AccountId),
    merchantId: toOptionalInt(input.merchantId ?? input.MerchantId),
    transactionId,
    transactionAmount: toFiniteNumber(input.transactionAmount ?? input.TransactionAmount),
    transactionDate: toOptionalText(input.transactionDate ?? input.TransactionDate),
    distanceDays: toDayDistance(input.distanceDays ?? input.DistanceDays),
    strength: toText(input.strength ?? input.Strength, "weak")
  };
}

/** El endpoint devuelve un array plano: sin envoltorio y sin paginación. */
export function normalizeBudgetItemSuggestions(input: unknown): BudgetItemSuggestion[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeBudgetItemSuggestion(item))
    .filter((item): item is BudgetItemSuggestion => item !== null);
}
