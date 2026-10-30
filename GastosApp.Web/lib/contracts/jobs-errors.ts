/**
 * Errores del contrato de jobs con código estable (S1/S2).
 *
 * El código —no el texto— decide el comportamiento: un `ALREADY_RUNNING` refresca el catálogo y
 * jamás reintenta; un `SHUTTING_DOWN` no se ejecutó. Un texto de error del upstream nunca se muestra
 * crudo: se cae al mensaje por defecto de su código.
 */

import { field, isRecord, toInteger, toTrimmed } from "./jobs-payload.ts";

export const JOB_ERROR_CODES = [
  "CONFIRMATION_REQUIRED",
  "UNKNOWN_JOB",
  "INVALID_FILTER",
  "ALREADY_RUNNING",
  "HISTORY_UNAVAILABLE",
  "SHUTTING_DOWN",
  "NOT_FOUND",
  "CATALOG_UNAVAILABLE",
  "HISTORY_READ_FAILED",
  "UNEXPECTED_BEGIN_STATE",
  "UNAUTHORIZED",
  "SESSION_EXPIRED",
  "FORBIDDEN",
  "BAD_REQUEST",
  "CSRF_REJECTED",
  "UPSTREAM_ERROR"
] as const;

export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

export type JobError = {
  code: JobErrorCode;
  message: string;
  traceId: string | null;
  /** Solo en un 409: la corrida que ya está en curso. */
  currentRunId: number | null;
};

const DEFAULT_ERROR_MESSAGES: Record<JobErrorCode, string> = {
  CONFIRMATION_REQUIRED: "La ejecución manual exige confirmación explícita.",
  UNKNOWN_JOB: "El job indicado no existe.",
  INVALID_FILTER: "Un filtro del historial no es válido.",
  ALREADY_RUNNING: "El job ya está en ejecución.",
  HISTORY_UNAVAILABLE: "No se pudo registrar la corrida, así que el job no se ejecutó.",
  SHUTTING_DOWN: "La API se está apagando; la corrida no se ejecutó.",
  NOT_FOUND: "La corrida indicada no existe.",
  CATALOG_UNAVAILABLE: "No se pudo leer el catálogo de jobs.",
  HISTORY_READ_FAILED: "No se pudo leer el historial de jobs.",
  UNEXPECTED_BEGIN_STATE: "No se pudo abrir la corrida.",
  UNAUTHORIZED: "Sesión requerida.",
  SESSION_EXPIRED: "La sesión expiró.",
  FORBIDDEN: "Solo un administrador puede usar este módulo.",
  BAD_REQUEST: "La petición no es válida.",
  CSRF_REJECTED: "La validación CSRF falló.",
  UPSTREAM_ERROR: "La API de jobs no respondió correctamente."
};

function errorCodeFromStatus(status: number): JobErrorCode {
  switch (status) {
    case 401:
      return "SESSION_EXPIRED";
    case 403:
      return "FORBIDDEN";
    case 400:
      return "BAD_REQUEST";
    default:
      return "UPSTREAM_ERROR";
  }
}

function toErrorCode(value: unknown, status: number): JobErrorCode {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (JOB_ERROR_CODES as readonly string[]).includes(normalized)
    ? (normalized as JobErrorCode)
    : errorCodeFromStatus(status);
}

/**
 * Normaliza el error del BFF/API. El código —no el texto— decide el comportamiento: un
 * `ALREADY_RUNNING` refresca el catálogo y jamás reintenta; un `SHUTTING_DOWN` no se ejecutó.
 */
export function normalizeJobError(input: unknown, status: number): JobError {
  const record = isRecord(input) ? input : null;
  const code = toErrorCode(record ? field(record, "code") : null, status);
  const message = record ? toTrimmed(field(record, "message")) : null;
  const traceId = record ? toTrimmed(field(record, "traceId")) : null;
  const currentRunId = record ? toInteger(field(record, "currentRunId")) : null;

  return {
    code,
    message: message ?? DEFAULT_ERROR_MESSAGES[code],
    traceId,
    currentRunId: currentRunId !== null && currentRunId > 0 ? currentRunId : null
  };
}
