// `budget-item-form-model.ts` se prueba con `node --experimental-strip-types --test`, que no
// resuelve el alias `@/`. Este es el único import de valor del archivo, así que va con ruta
// relativa y extensión explícita (precedente: los propios archivos `.test.ts`).
import {
  isBudgetItemKind,
  toDateInputValue,
  type BudgetItem,
  type BudgetItemWriteRequest
} from "../../../../lib/contracts/budget-items.ts";

export type BudgetItemFormValues = {
  kind: string;
  name: string;
  plannedAmount: string;
  plannedDate: string;
  categoryId: number | null;
  subcategoryId: number | null;
  accountId: number | null;
  merchantId: number | null;
  notes: string;
};

export type BudgetItemFormErrors = Partial<Record<"name" | "plannedAmount" | "plannedDate" | "scope" | "notes", string>>;

/** `budget_items.name` es `VARCHAR(120)` y `notes` son 300: se validan aquí, no solo en el API. */
export const MAX_BUDGET_ITEM_NAME_LENGTH = 120;
export const MAX_BUDGET_ITEM_NOTES_LENGTH = 300;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `null` cuando el texto no es un número válido; los importes se redondean a 2 decimales como el API. */
export function parseItemAmount(value: string): number | null {
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

/** El alta parte de la fecha indicada: el periodo se deriva de ella en el backend. */
export function createEmptyBudgetItemForm(defaultDate: string): BudgetItemFormValues {
  return {
    kind: "expense",
    name: "",
    plannedAmount: "",
    plannedDate: defaultDate,
    categoryId: null,
    subcategoryId: null,
    accountId: null,
    merchantId: null,
    notes: ""
  };
}

export function toBudgetItemFormValues(item: BudgetItem): BudgetItemFormValues {
  return {
    kind: item.kind,
    name: item.name,
    plannedAmount: String(item.plannedAmount),
    plannedDate: toDateInputValue(item.plannedDate),
    categoryId: item.categoryId,
    subcategoryId: item.subcategoryId,
    accountId: item.accountId,
    merchantId: item.merchantId,
    notes: item.notes ?? ""
  };
}

/** Modo de alcance del formulario: el ingreso nunca ofrece subcategoría. */
export function isCategoryOnlyKind(kind: string): boolean {
  return kind === "income";
}

export function validateBudgetItemForm(values: BudgetItemFormValues): BudgetItemFormErrors {
  const errors: BudgetItemFormErrors = {};

  if (!isBudgetItemKind(values.kind)) {
    errors.scope = "Selecciona un tipo de partida";
    return errors;
  }

  const name = values.name.trim();
  if (!name) {
    errors.name = "Nombre requerido";
  } else if (name.length > MAX_BUDGET_ITEM_NAME_LENGTH) {
    errors.name = `Máximo ${MAX_BUDGET_ITEM_NAME_LENGTH} caracteres`;
  }

  const amount = parseItemAmount(values.plannedAmount);
  if (amount === null || amount <= 0) {
    errors.plannedAmount = "Monto mayor a 0";
  }

  if (!DATE_PATTERN.test(values.plannedDate.trim())) {
    errors.plannedDate = "Fecha requerida (aaaa-mm-dd)";
  }

  // Scope XOR: exactamente uno de categoría o subcategoría. Un ingreso no admite subcategoría.
  if (isCategoryOnlyKind(values.kind)) {
    if (values.categoryId === null) {
      errors.scope = "Selecciona una categoría de ingreso";
    }
  } else if (values.categoryId === null && values.subcategoryId === null) {
    errors.scope = "Selecciona una categoría o una subcategoría";
  } else if (values.categoryId !== null && values.subcategoryId !== null) {
    errors.scope = "Elige categoría o subcategoría, no ambas";
  }

  if (values.notes.trim().length > MAX_BUDGET_ITEM_NOTES_LENGTH) {
    errors.notes = `Máximo ${MAX_BUDGET_ITEM_NOTES_LENGTH} caracteres`;
  }

  return errors;
}

/**
 * Cuerpo de alta/edición. `periodKey` nunca viaja: el backend lo deriva de `plannedDate`.
 * `kind` se reenvía siempre porque el API lo exige, y en edición responde 400 si difiere del alta.
 */
export function toBudgetItemWriteRequest(values: BudgetItemFormValues): BudgetItemWriteRequest {
  const isIncome = isCategoryOnlyKind(values.kind);
  // El alcance es XOR: una subcategoría solo viaja cuando no hay categoría.
  const useSubcategory = !isIncome && values.subcategoryId !== null && values.categoryId === null;

  return {
    kind: values.kind,
    name: values.name.trim(),
    plannedAmount: parseItemAmount(values.plannedAmount) ?? 0,
    plannedDate: values.plannedDate.trim(),
    categoryId: useSubcategory ? null : values.categoryId,
    subcategoryId: useSubcategory ? values.subcategoryId : null,
    accountId: values.accountId,
    merchantId: values.merchantId,
    notes: values.notes.trim().length > 0 ? values.notes.trim() : null,
    // El formulario manual nunca liga plantillas: el alta selectiva viaja por
    // `createBudgetItemFromTemplate`, no por aquí.
    recurringItemId: null
  };
}
