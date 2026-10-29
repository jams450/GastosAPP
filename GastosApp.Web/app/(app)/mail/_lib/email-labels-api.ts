import { parseApiError } from "@/lib/bff/client-session";
import { normalizeEmailLabels } from "@/lib/contracts/email-labels";
import type { EmailLabel, EmailLabelUpsertPayload } from "@/lib/contracts/email-labels";
import { requestJson } from "../../catalogs/_shared/catalogs-api";

/**
 * Acceso a las etiquetas de correo. Reutiliza `requestJson` del catálogo de gastos: la mecánica
 * (CSRF, parseo de error) es la misma, y una segunda copia solo serviría para que se desincronicen.
 */
export async function fetchEmailLabels(): Promise<EmailLabel[]> {
  const response = await fetch("/api/bff/mail/labels", { cache: "no-store" });
  if (!response.ok) {
    throw await parseApiError(response, "No se pudieron cargar las etiquetas de correo");
  }

  return normalizeEmailLabels(await response.json());
}

export async function createEmailLabel(payload: EmailLabelUpsertPayload): Promise<void> {
  await requestJson("/api/bff/mail/labels", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear la etiqueta");
}

export async function updateEmailLabel(labelId: number, payload: EmailLabelUpsertPayload): Promise<void> {
  await requestJson(`/api/bff/mail/labels/${labelId}`, { method: "PUT", body: JSON.stringify(payload) }, "No se pudo actualizar la etiqueta");
}

export async function setEmailLabelActive(labelId: number, active: boolean): Promise<void> {
  await requestJson(
    `/api/bff/mail/labels/${labelId}/active`,
    { method: "PATCH", body: JSON.stringify({ active }) },
    "No se pudo actualizar el estado de la etiqueta"
  );
}

/** Crea las etiquetas del sistema que falten. El endpoint es idempotente por slug. */
export async function seedEmailLabelDefaults(): Promise<void> {
  await requestJson("/api/bff/mail/labels/defaults", { method: "POST" }, "No se pudieron crear las etiquetas por defecto");
}
