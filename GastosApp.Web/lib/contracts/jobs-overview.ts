/**
 * Catálogo de jobs tal como lo pinta la pantalla (S1).
 *
 * El catálogo no puede repetir una clave —dos tarjetas del mismo job confundirían el botón de
 * ejecutar y los conteos— y descarta las claves ajenas al vocabulario. Los totales se derivan de los
 * seis estados contados: el `total` que llegue por cable no puede sumar un estado que la pantalla no
 * sabe pintar.
 */

import { field, isRecord, toBoolean, toEnum, toIsoString, toInteger, toTrimmed } from "./jobs-payload.ts";
import {
  emptyJobStatusCounts,
  normalizeJobRunSummary,
  normalizeJobSchedule,
  normalizeStatusCounts,
  type JobRunSummary,
  type JobSchedule,
  type JobStatusCounts
} from "./jobs-runs.ts";
import { JOB_KEYS, type JobKey } from "./jobs-vocabulary.ts";

export type JobCatalogItem = {
  jobKey: JobKey;
  displayName: string;
  description: string;
  /** Interruptor del horario automático. No condiciona la corrida manual (S3). */
  automaticEnabled: boolean;
  /** Clave de configuración que enciende el horario; se muestra, no se edita. */
  automaticEnabledBy: string;
  /** La API siempre lo publica en `true`; ausente se lee como no permitido. */
  manualRunAllowed: boolean;
  configuredOwnerUserId: number | null;
  ownerConfiguredBy: string | null;
  schedule: JobSchedule | null;
  nextRunAtUtc: string | null;
  current: JobRunSummary | null;
  last: JobRunSummary | null;
  counts: JobStatusCounts;
};

export type JobOverview = {
  generatedAtUtc: string | null;
  jobs: JobCatalogItem[];
  totals: JobStatusCounts;
};

function normalizeJobCatalogItem(input: unknown): JobCatalogItem | null {
  if (!isRecord(input)) return null;

  const jobKey = toEnum(field(input, "jobKey"), JOB_KEYS);
  const displayName = toTrimmed(field(input, "displayName"));
  if (!jobKey || !displayName) return null;

  const ownerId = toInteger(field(input, "configuredOwnerUserId"));

  return {
    jobKey,
    displayName,
    description: toTrimmed(field(input, "description")) ?? "",
    automaticEnabled: toBoolean(field(input, "automaticEnabled"), false),
    automaticEnabledBy: toTrimmed(field(input, "automaticEnabledBy")) ?? "",
    // Ante la duda el botón queda apagado: ejecutar sin permiso explícito es peor que no ejecutar.
    manualRunAllowed: toBoolean(field(input, "manualRunAllowed"), false),
    configuredOwnerUserId: ownerId !== null && ownerId > 0 ? ownerId : null,
    ownerConfiguredBy: toTrimmed(field(input, "ownerConfiguredBy")),
    schedule: normalizeJobSchedule(field(input, "schedule")),
    nextRunAtUtc: toIsoString(field(input, "nextRunAtUtc")),
    current: normalizeJobRunSummary(field(input, "current")),
    last: normalizeJobRunSummary(field(input, "last")),
    counts: normalizeStatusCounts(field(input, "counts"))
  };
}

export function hasJobOverviewShape(input: unknown): boolean {
  return isRecord(input) && Array.isArray(field(input, "jobs"));
}

export function normalizeJobOverview(input: unknown): JobOverview {
  if (!isRecord(input)) {
    return { generatedAtUtc: null, jobs: [], totals: emptyJobStatusCounts() };
  }

  const rawJobs = field(input, "jobs");
  const seen = new Set<JobKey>();
  const jobs: JobCatalogItem[] = [];

  if (Array.isArray(rawJobs)) {
    for (const raw of rawJobs) {
      const item = normalizeJobCatalogItem(raw);
      // El catálogo no puede repetir una clave: dos tarjetas del mismo job confundirían el botón
      // de ejecutar y los conteos.
      if (!item || seen.has(item.jobKey)) continue;
      seen.add(item.jobKey);
      jobs.push(item);
    }
  }

  return {
    generatedAtUtc: toIsoString(field(input, "generatedAtUtc")),
    jobs,
    totals: normalizeStatusCounts(field(input, "totals"))
  };
}
