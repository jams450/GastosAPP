import { CalendarClock, ExternalLink, Play, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { describeJobSchedule, isRunInProgress, type JobCatalogItem, type JobRunSummary } from "@/lib/contracts/jobs";
import {
  describeNextRun,
  describeOwner,
  formatDuration,
  formatRunDateTime,
  formatRunItems,
  JOB_STATUS_LABELS
} from "../_lib/jobs-ui";
import { JobStatusBadge, JobTriggerBadge } from "./job-status-badge";

type Props = {
  job: JobCatalogItem;
  runPending: boolean;
  runBlocked: boolean;
  onRequestRun: (job: JobCatalogItem) => void;
  onOpenRun: (jobRunId: number) => void;
};

function runHint(job: JobCatalogItem, runPending: boolean, runBlocked: boolean): string {
  if (!job.manualRunAllowed) return "La API no permite ejecutar este job a demanda.";
  if (isRunInProgress(job.current)) return "Espera a que termine la corrida en curso: no se encola otra.";
  if (runPending) return "Registrando la corrida…";
  if (runBlocked) return "Confirma antes en el historial si la corrida anterior se registró.";
  return "Pide confirmación explícita antes de ejecutar. No se encola.";
}

function RunLine({ label, run, onOpenRun }: { label: string; run: JobRunSummary; onOpenRun: (jobRunId: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      <JobStatusBadge status={run.status} />
      <JobTriggerBadge trigger={run.trigger} />
      <span className="text-secondary text-xs" title={run.startedAtUtc}>
        {formatRunDateTime(run.startedAtUtc)}
      </span>
      <span className="text-muted text-xs">· {formatDuration(run.durationMs)}</span>
      <span className="text-muted text-xs">· {formatRunItems(run)}</span>
      <button
        type="button"
        className="text-accent inline-flex items-center gap-1 text-[11px] font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]"
        onClick={() => onOpenRun(run.jobRunId)}
      >
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
        Ver corrida #{run.jobRunId}
      </button>
    </div>
  );
}

/**
 * Tarjeta de un job: estado del horario, dueño, corrida en curso, última corrida y la acción manual.
 *
 * El botón se apaga —no se esconde— cuando hay una corrida en curso o el permiso no está: esconderlo
 * dejaría al operador sin saber por qué no puede ejecutar.
 */
export function JobCard({ job, runPending, runBlocked, onRequestRun, onOpenRun }: Props) {
  const running = isRunInProgress(job.current);
  const disabled = !job.manualRunAllowed || running || runPending || runBlocked;
  const hintId = `job-run-hint-${job.jobKey}`;
  const statusForBadge = job.current?.status ?? job.last?.status ?? null;

  return (
    <Card className="app-panel flex h-full flex-col gap-3 overflow-hidden p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-primary text-sm font-semibold">{job.displayName}</h3>
          <p className="text-muted mt-0.5 font-mono text-[11px]">{job.jobKey}</p>
        </div>
        {statusForBadge ? (
          <JobStatusBadge status={statusForBadge} />
        ) : (
          <span className="text-muted rounded-full border border-[var(--color-border-strong)] px-2 py-0.5 text-[10px] font-semibold">
            Sin corridas
          </span>
        )}
      </div>

      {job.description ? <p className="text-secondary text-xs leading-relaxed">{job.description}</p> : null}

      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted text-[11px] font-semibold uppercase tracking-wide">Automático</dt>
          <dd className="text-primary mt-0.5">
            {job.automaticEnabled ? "Activado" : "Desactivado"}
            {job.automaticEnabledBy ? <span className="text-muted ml-1 font-mono text-[10px]">{job.automaticEnabledBy}</span> : null}
            <span className="text-muted mt-1 block text-[11px]">La corrida manual no depende de este interruptor.</span>
          </dd>
        </div>

        <div>
          <dt className="text-muted text-[11px] font-semibold uppercase tracking-wide">Horario</dt>
          <dd className="text-primary mt-0.5">
            <span className="inline-flex items-start gap-1">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
              {describeJobSchedule(job.schedule)}
            </span>
            <span className="text-muted mt-1 block text-[11px]">
              {describeNextRun(job.nextRunAtUtc, job.schedule, job.automaticEnabled)}
            </span>
          </dd>
        </div>

        <div>
          <dt className="text-muted text-[11px] font-semibold uppercase tracking-wide">Dueño configurado</dt>
          <dd className="text-primary mt-0.5 inline-flex items-start gap-1">
            <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
            {describeOwner(job.configuredOwnerUserId, job.ownerConfiguredBy)}
          </dd>
        </div>

        <div>
          <dt className="text-muted text-[11px] font-semibold uppercase tracking-wide">Conteos</dt>
          <dd className="text-secondary mt-0.5 flex flex-wrap gap-x-2 gap-y-1">
            <span>Total <span className="text-primary font-semibold">{job.counts.total}</span></span>
            <span>OK <span className="text-primary font-semibold">{job.counts.succeeded}</span></span>
            <span>Parcial <span className="text-primary font-semibold">{job.counts.partial}</span></span>
            <span>Falló <span className="text-primary font-semibold">{job.counts.failed}</span></span>
            <span>Omitido <span className="text-primary font-semibold">{job.counts.skipped}</span></span>
            <span>Interrumpido <span className="text-primary font-semibold">{job.counts.interrupted}</span></span>
          </dd>
        </div>
      </dl>

      <div className="border-default mt-auto space-y-1.5 border-t pt-3">
        {job.current ? <RunLine label="En curso" run={job.current} onOpenRun={onOpenRun} /> : null}
        {job.last ? (
          <RunLine label="Última" run={job.last} onOpenRun={onOpenRun} />
        ) : (
          <p className="text-muted text-xs">Todavía no hay corridas cerradas para este job.</p>
        )}
        {job.last?.failureType || job.last?.outcomeCode ? (
          <p className="text-muted text-[11px]">
            Resultado registrado:{" "}
            <span className="text-primary font-mono">{job.last.outcomeCode ?? job.last.failureType}</span>
            {job.last.status === "skipped" ? ` · ${JOB_STATUS_LABELS.skipped.toLowerCase()} por una protección del job` : null}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-9 rounded-md px-3 text-xs font-bold"
          disabled={disabled}
          loading={runPending}
          loadingText="Registrando..."
          aria-describedby={hintId}
          onClick={() => onRequestRun(job)}
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          Ejecutar ahora
        </Button>
        <p id={hintId} className="text-muted text-[11px]">
          {runHint(job, runPending, runBlocked)}
        </p>
      </div>
    </Card>
  );
}
