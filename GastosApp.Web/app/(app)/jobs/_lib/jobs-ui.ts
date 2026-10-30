import type { JobRunSummary, JobSchedule, JobStatus, JobTrigger } from "@/lib/contracts/jobs";

/**
 * Textos y formato de la pantalla de jobs.
 *
 * Las horas se pintan en la zona del centro de México con una zona explícita: el componente también
 * se renderiza en el servidor, y una zona tomada del entorno produciría un desajuste de hidratación.
 * La hora UTC exacta queda en el `title` de cada fecha.
 */
export const JOBS_TIMEZONE = "America/Mexico_City";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  running: "En ejecución",
  succeeded: "Completado",
  partial: "Parcial",
  failed: "Falló",
  skipped: "Omitido",
  interrupted: "Interrumpido"
};

export const JOB_TRIGGER_LABELS: Record<JobTrigger, string> = {
  automatic: "Automático",
  manual: "Manual"
};

const STATUS_BADGE_CLASS: Record<JobStatus, string> = {
  running: "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/12 text-[var(--color-accent)]",
  succeeded: "border-[var(--color-success)]/35 bg-[var(--color-success)]/14 text-[var(--color-success)]",
  partial: "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/14 text-[var(--color-warning)]",
  failed: "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/14 text-[var(--color-danger)]",
  skipped: "border-[var(--color-border-strong)] bg-[var(--color-surface-3)] text-muted",
  interrupted: "border-[var(--color-warning)]/35 bg-[var(--color-surface-3)] text-[var(--color-warning)]"
};

export function statusBadgeClass(status: JobStatus): string {
  return `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE_CLASS[status]}`;
}

export const RUN_DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  timeZone: JOBS_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

export function formatRunDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : RUN_DATE_FORMATTER.format(date);
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) return "—";
  if (durationMs < 1000) return `${durationMs} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)} s`;

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes} min ${seconds} s`;
}

/** "12 procesados · 3 con error" — los conteos son del job, nunca montos. */
export function formatRunItems(run: Pick<JobRunSummary, "itemsProcessed" | "itemsFailed">): string {
  const failed = run.itemsFailed > 0 ? ` · ${run.itemsFailed} con error` : "";
  return `${run.itemsProcessed} procesados${failed}`;
}

export function describeNextRun(nextRunAtUtc: string | null, schedule: JobSchedule | null, automaticEnabled: boolean): string {
  if (!automaticEnabled) return "Sin próxima corrida: el horario automático está apagado.";
  if (nextRunAtUtc) return `Próxima corrida: ${formatRunDateTime(nextRunAtUtc)}`;
  if (schedule?.kind === "interval") {
    return "Hora no calculable: el intervalo se cuenta desde el arranque del proceso.";
  }
  return "Hora no calculable.";
}

/** Un job sin dueño configurable lo dice; uno que sí lo tiene pero sin valor también. */
export function describeOwner(ownerUserId: number | null, ownerConfiguredBy: string | null): string {
  if (ownerUserId !== null) {
    const by = ownerConfiguredBy ? ` · ${ownerConfiguredBy}` : "";
    return `Usuario #${ownerUserId}${by}`;
  }
  if (ownerConfiguredBy) return `Sin configurar · ${ownerConfiguredBy}`;
  return "Sin dueño configurable";
}
