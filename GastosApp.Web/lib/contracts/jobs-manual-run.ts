/**
 * Corrida manual (S3): confirmación explícita y motivo opcional.
 *
 * El 202 significa que la fila de historial ya existe y la corrida se abrió. Un cuerpo que no diga
 * eso no se puede presentar como éxito, y un `Confirm` ausente no es una confirmación: la pantalla no
 * puede enviar una petición sin la decisión explícita del administrador.
 *
 * El motivo es opcional y **no se persiste** en esta versión: la API acepta `Reason` en el cuerpo,
 * pero el historial no lo guarda. Se valida para no cortar el envío por un texto demasiado largo.
 */

import { normalizeJobRunSummary } from "./jobs-runs.ts";
import { MANUAL_RUN_REASON_MAX_LENGTH, type JobStatus, type JobTrigger } from "./jobs-vocabulary.ts";

export type ManualRunAccepted = {
  jobRunId: number;
  jobKey: string;
  trigger: JobTrigger;
  status: JobStatus;
  startedAtUtc: string;
};

export function normalizeManualRunAccepted(input: unknown): ManualRunAccepted | null {
  const summary = normalizeJobRunSummary(input);
  if (!summary) return null;
  if (summary.trigger !== "manual" || summary.status !== "running") return null;

  return {
    jobRunId: summary.jobRunId,
    jobKey: summary.jobKey,
    trigger: summary.trigger,
    status: summary.status,
    startedAtUtc: summary.startedAtUtc
  };
}

export type ManualRunReasonResult = { ok: true; reason: string | null } | { ok: false; message: string };

export function validateManualRunReason(value: string | null | undefined): ManualRunReasonResult {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length === 0) return { ok: true, reason: null };
  if (reason.length > MANUAL_RUN_REASON_MAX_LENGTH) {
    return {
      ok: false,
      message: `El motivo no puede exceder ${MANUAL_RUN_REASON_MAX_LENGTH} caracteres.`
    };
  }
  return { ok: true, reason };
}

export type ManualRunRequestBody = { Confirm: true; Reason?: string };

export type ManualRunRequestResult = { ok: true; body: ManualRunRequestBody } | { ok: false; message: string };

/**
 * Cuerpo de `POST /api/jobs/{key}/run` en la forma que publica la API (PascalCase). `Confirm` va
 * siempre en `true`: el campo ausente no es una confirmación.
 */
export function buildManualRunRequest(reason: string | null | undefined): ManualRunRequestResult {
  const validated = validateManualRunReason(reason);
  if (!validated.ok) return validated;

  return {
    ok: true,
    body: validated.reason === null ? { Confirm: true } : { Confirm: true, Reason: validated.reason }
  };
}
