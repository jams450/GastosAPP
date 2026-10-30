/**
 * Vocabulario del contrato de jobs (S1/S7): claves, estados, orígenes y acotamiento de páginas.
 *
 * Son los valores que la API y la base comparten. Un valor fuera de estas listas no se pinta ni se
 * reenvía: una corrida con un estado que la pantalla no sabe leer se descarta, y un filtro inventado
 * devolvería una página vacía indistinguible de "no hay historial".
 */

/** Las cinco claves estables de la API (L5/L7). Son también las que acepta `POST .../run`. */
export const JOB_KEYS = [
  "email_ingest",
  "fx_rate_sync",
  "recurring_execution",
  "alert_evaluation",
  "alert_dispatch"
] as const;

export type JobKey = (typeof JOB_KEYS)[number];

export const JOB_STATUSES = ["running", "succeeded", "partial", "failed", "skipped", "interrupted"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TRIGGERS = ["automatic", "manual"] as const;

export type JobTrigger = (typeof JOB_TRIGGERS)[number];

export const JOB_SCHEDULE_KINDS = ["daily", "startup_daily", "interval"] as const;

export type JobScheduleKind = (typeof JOB_SCHEDULE_KINDS)[number];

export const JOB_HISTORY_PAGE_SIZES = [10, 25, 50] as const;

export const JOB_HISTORY_DEFAULT_PAGE_SIZE = 25;

export const JOB_HISTORY_MAX_PAGE_SIZE = 100;

/** Tope del motivo opcional de una corrida manual (`RunJobRequest.Reason`). */
export const MANUAL_RUN_REASON_MAX_LENGTH = 200;

/** Las páginas que ya no existen en el servidor se piden desde la primera. */
export function clampHistoryPage(value: number): number {
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

/** El servidor acota a 1..100; la pantalla ofrece 10/25/50 y nunca pide fuera del rango. */
export function clampHistoryPageSize(value: number): number {
  if (!Number.isInteger(value) || value < 1) return JOB_HISTORY_DEFAULT_PAGE_SIZE;
  return Math.min(value, JOB_HISTORY_MAX_PAGE_SIZE);
}

/** Guardas del vocabulario, para que una ruta no reenvíe un filtro o una clave inventada. */
export function isJobKey(value: string): value is JobKey {
  return (JOB_KEYS as readonly string[]).includes(value);
}

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export function isJobTrigger(value: string): value is JobTrigger {
  return (JOB_TRIGGERS as readonly string[]).includes(value);
}
