import { parseApiError } from "@/lib/bff/client-session";
import { normalizeEmailRules } from "@/lib/contracts/email-rules";
import type { EmailRule, EmailRuleUpsertPayload } from "@/lib/contracts/email-rules";
import { requestJson } from "../../catalogs/_shared/catalogs-api";

export async function fetchEmailRules(): Promise<EmailRule[]> {
  const response = await fetch("/api/bff/mail/rules", { cache: "no-store" });
  if (!response.ok) {
    throw await parseApiError(response, "No se pudieron cargar las reglas de correo");
  }

  return normalizeEmailRules(await response.json());
}

export async function createEmailRule(payload: EmailRuleUpsertPayload): Promise<void> {
  await requestJson("/api/bff/mail/rules", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear la regla");
}

export async function updateEmailRule(ruleId: number, payload: EmailRuleUpsertPayload): Promise<void> {
  await requestJson(`/api/bff/mail/rules/${ruleId}`, { method: "PUT", body: JSON.stringify(payload) }, "No se pudo actualizar la regla");
}

export async function setEmailRuleActive(ruleId: number, active: boolean): Promise<void> {
  await requestJson(
    `/api/bff/mail/rules/${ruleId}/active`,
    { method: "PATCH", body: JSON.stringify({ active }) },
    "No se pudo actualizar el estado de la regla"
  );
}
