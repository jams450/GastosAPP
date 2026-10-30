"use client";

import { redirectToLoginOnSessionExpired } from "@/lib/bff/client-session";
import {
  buildJobHistoryQuery,
  buildManualRunRequest,
  normalizeJobError,
  normalizeJobHistory,
  normalizeJobOverview,
  normalizeJobRunDetail,
  normalizeManualRunAccepted,
  type JobError,
  type JobHistoryFilterSelection,
  type JobHistoryPage,
  type JobKey,
  type JobOverview,
  type JobRunDetail,
  type ManualRunAccepted
} from "@/lib/contracts/jobs";
import { csrfFetch } from "@/lib/security/csrf-client";

/** Timeout defensivo: una lectura de jobs no debe dejar la pantalla colgada para siempre. */
const READ_TIMEOUT_MS = 15_000;

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function fetchJobsOverview(): Promise<JobOverview> {
  const response = await fetch("/api/bff/jobs", {
    cache: "no-store",
    signal: AbortSignal.timeout(READ_TIMEOUT_MS)
  });

  if (!response.ok) {
    const error = normalizeJobError(await readJson(response), response.status);
    redirectToLoginOnSessionExpired(response, { code: error.code });
    throw new Error(error.message);
  }

  return normalizeJobOverview(await readJson(response));
}

export async function fetchJobHistory(filters: JobHistoryFilterSelection): Promise<JobHistoryPage> {
  const response = await fetch(`/api/bff/jobs/history?${buildJobHistoryQuery(filters)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(READ_TIMEOUT_MS)
  });

  if (!response.ok) {
    const error = normalizeJobError(await readJson(response), response.status);
    redirectToLoginOnSessionExpired(response, { code: error.code });
    throw new Error(error.message);
  }

  return normalizeJobHistory(await readJson(response), { page: filters.page, pageSize: filters.pageSize });
}

export async function fetchJobRun(jobRunId: number): Promise<JobRunDetail> {
  const response = await fetch(`/api/bff/jobs/${jobRunId}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(READ_TIMEOUT_MS)
  });

  if (!response.ok) {
    const error = normalizeJobError(await readJson(response), response.status);
    redirectToLoginOnSessionExpired(response, { code: error.code });
    throw new Error(error.message);
  }

  const detail = normalizeJobRunDetail(await readJson(response));
  if (!detail) {
    throw new Error("La API devolvió una corrida con una forma inesperada.");
  }

  return detail;
}

/**
 * Resultado de pedir una corrida manual. La distinción no es cosmética:
 * - `accepted`: la fila de historial existe y el job arrancó; se refresca el catálogo.
 * - `conflict`: ya había una corrida en curso; no se encola nada y **no se reintenta**.
 * - `rejected`: la API dijo explícitamente que no se ejecutó (sin historial, apagando, sin confirmar).
 * - `uncertain`: la petición pudo llegar o no (red, 502, cuerpo ilegible). Solo se refresca el
 *   historial: reintentar a ciegas podría abrir una segunda corrida.
 */
export type ManualRunOutcome =
  | { kind: "accepted"; accepted: ManualRunAccepted }
  | { kind: "conflict"; error: JobError }
  | { kind: "rejected"; error: JobError }
  | { kind: "uncertain"; message: string };

export async function requestManualRun(jobKey: JobKey, reason: string | null): Promise<ManualRunOutcome> {
  const request = buildManualRunRequest(reason);
  if (!request.ok) {
    return {
      kind: "rejected",
      error: { code: "BAD_REQUEST", message: request.message, traceId: null, currentRunId: null }
    };
  }

  let response: Response;
  try {
    response = await csrfFetch(`/api/bff/jobs/${encodeURIComponent(jobKey)}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(READ_TIMEOUT_MS)
    });
  } catch {
    return { kind: "uncertain", message: "No pudimos confirmar si la corrida se registró." };
  }

  if (response.status === 202) {
    const accepted = normalizeManualRunAccepted(await readJson(response));
    return accepted
      ? { kind: "accepted", accepted }
      : { kind: "uncertain", message: "La API aceptó la corrida sin devolver su identificador." };
  }

  const error = normalizeJobError(await readJson(response), response.status);
  redirectToLoginOnSessionExpired(response, { code: error.code });

  if (response.status === 409) return { kind: "conflict", error };
  if (response.status === 400 || response.status === 500 || response.status === 503) {
    return { kind: "rejected", error };
  }

  return { kind: "uncertain", message: error.message };
}
