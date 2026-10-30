/**
 * Forma de una corrida y de un horario de job (S1).
 *
 * Es lo que la pantalla pinta de cada ejecución y de cada tarjeta del catálogo. La regla que manda
 * aquí: una corrida cuyos valores no se pueden interpretar **se descarta** (`null`). Pintarla con
 * valores inventados haría creer que el job corrió. Y `failureType` es solo un tipo de excepción o un
 * código estable: nunca se lee un mensaje crudo.
 */

import {
  field,
  isRecord,
  toBoolean,
  toEnum,
  toIsoString,
  toInteger,
  toNonNegativeInteger,
  toTrimmed
} from "./jobs-payload.ts";
import {
  JOB_SCHEDULE_KINDS,
  JOB_STATUSES,
  JOB_TRIGGERS,
  type JobScheduleKind,
  type JobStatus,
  type JobTrigger
} from "./jobs-vocabulary.ts";

/* ------------------------------------------------------------------------- */
/* Conteos por estado                                                         */
/* ------------------------------------------------------------------------- */

export type JobStatusCounts = Record<JobStatus, number> & { total: number };

export function emptyJobStatusCounts(): JobStatusCounts {
  return { running: 0, succeeded: 0, partial: 0, failed: 0, skipped: 0, interrupted: 0, total: 0 };
}

export function normalizeStatusCounts(input: unknown): JobStatusCounts {
  const counts = emptyJobStatusCounts();
  if (!isRecord(input)) return counts;

  for (const status of JOB_STATUSES) {
    counts[status] = toNonNegativeInteger(field(input, status)) ?? 0;
    counts.total += counts[status];
  }

  return counts;
}

/* ------------------------------------------------------------------------- */
/* Corridas                                                                   */
/* ------------------------------------------------------------------------- */

export type JobRunSummary = {
  jobRunId: number;
  /** Clave tal como quedó persistida: el historial conserva claves fuera del catálogo. */
  jobKey: string;
  trigger: JobTrigger;
  status: JobStatus;
  startedAtUtc: string;
  finishedAtUtc: string | null;
  durationMs: number | null;
  requestedBy: string | null;
  itemsProcessed: number;
  itemsFailed: number;
  outcomeCode: string | null;
  failureType: string | null;
};

export type JobRunDetail = JobRunSummary & { jobDisplayName: string };

/**
 * Normaliza una corrida. Devuelve `null` cuando no hay forma honesta de pintarla: sin id, sin clave,
 * con un estado u origen fuera del vocabulario, o con una fecha de inicio ilegible.
 */
export function normalizeJobRunSummary(input: unknown): JobRunSummary | null {
  if (!isRecord(input)) return null;

  const jobRunId = toInteger(field(input, "jobRunId"));
  const jobKey = toTrimmed(field(input, "jobKey"));
  const trigger = toEnum(field(input, "trigger"), JOB_TRIGGERS);
  const status = toEnum(field(input, "status"), JOB_STATUSES);
  const startedAtUtc = toIsoString(field(input, "startedAtUtc"));

  if (jobRunId === null || jobRunId <= 0 || !jobKey || !trigger || !status || !startedAtUtc) {
    return null;
  }

  const isOpen = status === "running";
  const finishedAtUtc = toIsoString(field(input, "finishedAtUtc"));
  const reportedDuration = toNonNegativeInteger(field(input, "durationMs"));
  const derivedDuration =
    !isOpen && finishedAtUtc
      ? Math.max(0, new Date(finishedAtUtc).getTime() - new Date(startedAtUtc).getTime())
      : null;

  return {
    jobRunId,
    jobKey,
    trigger,
    status,
    startedAtUtc,
    // Una corrida abierta no tiene fin ni duración; si llegaran, serían de otra corrida.
    finishedAtUtc: isOpen ? null : finishedAtUtc,
    durationMs: isOpen ? null : reportedDuration ?? derivedDuration,
    requestedBy: toTrimmed(field(input, "requestedBy")),
    itemsProcessed: toNonNegativeInteger(field(input, "itemsProcessed")) ?? 0,
    itemsFailed: toNonNegativeInteger(field(input, "itemsFailed")) ?? 0,
    outcomeCode: toTrimmed(field(input, "outcomeCode")),
    failureType: toTrimmed(field(input, "failureType"))
  };
}

export function isRunInProgress(run: { status: JobStatus } | null | undefined): boolean {
  return run?.status === "running";
}

export function normalizeJobRunDetail(input: unknown): JobRunDetail | null {
  const summary = normalizeJobRunSummary(input);
  if (!summary || !isRecord(input)) return null;

  return {
    ...summary,
    // La API ya resuelve el nombre y cae a la clave para un job retirado del catálogo.
    jobDisplayName: toTrimmed(field(input, "jobDisplayName")) ?? summary.jobKey
  };
}

/* ------------------------------------------------------------------------- */
/* Horario                                                                    */
/* ------------------------------------------------------------------------- */

export type JobSchedule = {
  kind: JobScheduleKind;
  hourUtc: number | null;
  intervalSeconds: number | null;
  runsAtStartup: boolean;
};

/**
 * Un horario solo se acepta completo: un diario sin hora o un intervalo sin periodo no describen
 * cuándo corre el job, y la pantalla prefiere decir "no disponible" a inventar una hora.
 */
export function normalizeJobSchedule(input: unknown): JobSchedule | null {
  if (!isRecord(input)) return null;

  const kind = toEnum(field(input, "kind"), JOB_SCHEDULE_KINDS);
  if (!kind) return null;

  const hourUtc = toInteger(field(input, "hourUtc"));
  const intervalSeconds = toInteger(field(input, "intervalSeconds"));
  const runsAtStartup = toBoolean(field(input, "runsAtStartup"), false);

  if (kind === "interval") {
    if (intervalSeconds === null || intervalSeconds <= 0) return null;
    return { kind, hourUtc: null, intervalSeconds, runsAtStartup };
  }

  if (hourUtc === null || hourUtc < 0 || hourUtc > 23) return null;
  return { kind, hourUtc, intervalSeconds: null, runsAtStartup };
}

/** Texto de horario en español; `null` (horario desconocido) se dice explícitamente. */
export function describeJobSchedule(schedule: JobSchedule | null): string {
  if (!schedule) return "Horario no disponible";

  const atStartup = schedule.runsAtStartup ? "al arrancar y " : "";
  const compact = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

  if (schedule.kind === "interval") {
    const seconds = schedule.intervalSeconds ?? 0;
    if (seconds > 0 && seconds % 3600 === 0) return compact(`${atStartup}cada ${seconds / 3600} h`);
    if (seconds > 0 && seconds % 60 === 0) return compact(`${atStartup}cada ${seconds / 60} min`);
    return compact(`${atStartup}cada ${seconds} s`);
  }

  const hour = String(schedule.hourUtc ?? 0).padStart(2, "0");
  return schedule.kind === "startup_daily"
    ? `Al arrancar y diario a las ${hour}:00 UTC`
    : `Diario a las ${hour}:00 UTC`;
}
