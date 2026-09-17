import { parseApiError } from "@/lib/bff/client-session";
import { normalizeAccountAnnualSummary, type AccountAnnualSummary } from "@/lib/contracts/account-annual-summary";
import { normalizeAccounts, type Account } from "@/lib/contracts/accounts";
import type { AccountUpsertPayload } from "@/lib/contracts/accounts-admin";
import { csrfFetch } from "@/lib/security/csrf-client";

export async function listAccounts(): Promise<Account[]> {
  const response = await fetch("/api/bff/accounts", { cache: "no-store" });
  if (!response.ok) {
    throw await parseApiError(response, "No se pudieron cargar cuentas");
  }

  const payload = await response.json();
  return normalizeAccounts(payload);
}

export async function getAccountAnnualSummary(accountId: number, year: number): Promise<AccountAnnualSummary> {
  const response = await fetch(`/api/bff/accounts/${accountId}/annual-summary?year=${encodeURIComponent(String(year))}`, { cache: "no-store" });
  if (!response.ok) {
    throw await parseApiError(response, "No se pudo cargar el histórico anual");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const summary = normalizeAccountAnnualSummary(payload);
  if (!summary) {
    throw new Error("El histórico anual recibido no es utilizable");
  }

  return summary;
}

export async function createAccount(payload: AccountUpsertPayload): Promise<void> {
  const response = await csrfFetch("/api/bff/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseApiError(response, "No se pudo guardar cuenta");
  }
}

export async function updateAccount(accountId: number, payload: AccountUpsertPayload): Promise<void> {
  const response = await csrfFetch(`/api/bff/accounts/${accountId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseApiError(response, "No se pudo guardar cuenta");
  }
}

export async function patchAccountActive(accountId: number, active: boolean): Promise<void> {
  const response = await csrfFetch(`/api/bff/accounts/${accountId}/active`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active })
  });

  if (!response.ok) {
    throw await parseApiError(response, "No se pudo actualizar estado");
  }
}
