import { parseApiError } from "@/lib/bff/client-session";
import {
  normalizeAlertDeliveries,
  normalizeAlertOutbox,
  normalizeAlertRetryResult,
  type AlertDelivery,
  type AlertOutboxEntry,
  type AlertRetryResult
} from "@/lib/contracts/alerts";
import {
  normalizeBudgets,
  normalizeBudgetStatuses,
  type Budget,
  type BudgetPeriodStatus
} from "@/lib/contracts/budgets";
import { csrfFetch } from "@/lib/security/csrf-client";

export type BudgetScopeType = "category" | "subcategory";

export type BudgetThresholdPayload = {
  name: string;
  percent: number;
  active: boolean;
};

export type BudgetCreatePayload = {
  periodKey: string;
  name: string;
  categoryId: number | null;
  subcategoryId: number | null;
  amountMxn: number;
  active: boolean;
  thresholds: BudgetThresholdPayload[];
};

export type BudgetUpdatePayload = {
  name: string;
  categoryId: number | null;
  subcategoryId: number | null;
  amountMxn: number;
  active: boolean;
};

async function listFrom<T>(path: string, fallback: string, normalize: (input: unknown) => T[]): Promise<T[]> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw await parseApiError(response, fallback);
  }

  return normalize(await response.json().catch(() => null));
}

async function sendJson(path: string, method: "POST" | "PUT" | "PATCH", body: unknown, fallback: string): Promise<void> {
  const response = await csrfFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw await parseApiError(response, fallback);
  }
}

export function fetchBudgets(period: string): Promise<Budget[]> {
  return listFrom(`/api/bff/budgets?period=${encodeURIComponent(period)}`, "No se pudieron cargar los presupuestos", normalizeBudgets);
}

export function fetchBudgetStatuses(period: string): Promise<BudgetPeriodStatus[]> {
  return listFrom(`/api/bff/budgets/status?period=${encodeURIComponent(period)}`, "No se pudo cargar el avance del periodo", normalizeBudgetStatuses);
}

export function createBudget(payload: BudgetCreatePayload): Promise<void> {
  return sendJson("/api/bff/budgets", "POST", payload, "No se pudo crear el presupuesto");
}

export function updateBudget(budgetId: number, payload: BudgetUpdatePayload): Promise<void> {
  return sendJson(`/api/bff/budgets/${budgetId}`, "PUT", payload, "No se pudo guardar el presupuesto");
}

/** El BFF reenvía el array crudo: el API espera el reemplazo completo de umbrales, sin envoltorio. */
export function replaceBudgetThresholds(budgetId: number, thresholds: BudgetThresholdPayload[]): Promise<void> {
  return sendJson(`/api/bff/budgets/${budgetId}/thresholds`, "PUT", thresholds, "No se pudieron guardar los umbrales");
}

export function patchBudgetActive(budgetId: number, active: boolean): Promise<void> {
  return sendJson(`/api/bff/budgets/${budgetId}/active`, "PATCH", { active }, "No se pudo actualizar el estado");
}

export function fetchAlertDeliveries(period: string): Promise<AlertDelivery[]> {
  return listFrom(`/api/bff/alerts/deliveries?period=${encodeURIComponent(period)}`, "No se pudo cargar el historial de alertas", normalizeAlertDeliveries);
}

/**
 * Solo el estado `failed`: es lo único que habilita un reintento. El contrato del BFF
 * nunca incluye `payload` ni `lastError`, así que no hay contenido de alerta que renderizar.
 */
export function fetchFailedAlertOutbox(): Promise<AlertOutboxEntry[]> {
  return listFrom("/api/bff/alerts/outbox?status=failed", "No se pudo cargar la bandeja de alertas", normalizeAlertOutbox);
}

export async function retryAlertOutbox(outboxId: number): Promise<AlertRetryResult> {
  const response = await csrfFetch(`/api/bff/alerts/outbox/${outboxId}/retry`, { method: "POST" });
  if (!response.ok) {
    throw await parseApiError(response, "No se pudo reintentar la alerta");
  }

  const result = normalizeAlertRetryResult(await response.json().catch(() => null));
  if (!result) {
    throw new Error("El servidor devolvió una respuesta inválida al reintentar");
  }

  return result;
}
