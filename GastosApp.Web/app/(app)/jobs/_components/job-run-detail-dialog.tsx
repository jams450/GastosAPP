"use client";

import { useEffect } from "react";
import { RefreshCw, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDuration, formatRunDateTime, JOB_TRIGGER_LABELS } from "../_lib/jobs-ui";
import { useJobRunDetail } from "../_hooks/use-job-run-detail";
import { JobStatusBadge } from "./job-status-badge";

type Props = {
  jobRunId: number | null;
  onClose: () => void;
};

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted text-[11px] font-semibold uppercase tracking-wide">{label}</dt>
      <dd className={mono ? "text-primary mt-0.5 font-mono text-xs break-words" : "text-primary mt-0.5 text-xs break-words"}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Detalle de una corrida. Solo muestra los campos del contrato: tipo de fallo y código de resultado,
 * nunca el mensaje crudo de una excepción ni contenido de correo.
 */
export function JobRunDetailDialog({ jobRunId, onClose }: Props) {
  const { detail, loading, error, reload } = useJobRunDetail(jobRunId);

  useEffect(() => {
    if (jobRunId === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [jobRunId, onClose]);

  if (jobRunId === null) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-[var(--color-overlay)] p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="app-panel w-full max-w-2xl p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-run-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="job-run-detail-title" className="text-primary text-sm font-semibold">
              Corrida #{jobRunId}
            </h2>
            <p className="text-muted mt-0.5 text-[11px]">
              {detail ? `${detail.jobDisplayName} · ${detail.jobKey}` : "Detalle del historial de jobs"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" className="h-8 px-2" onClick={reload} aria-label="Actualizar corrida">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Actualizar
            </Button>
            <Button type="button" variant="ghost" className="h-8 px-2" onClick={onClose} aria-label="Cerrar detalle">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {error ? (
          <Alert variant="danger" className="mt-3">
            {error}
          </Alert>
        ) : null}

        {loading && !detail ? <p className="text-muted mt-3 text-xs">Cargando corrida…</p> : null}

        {detail ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <JobStatusBadge status={detail.status} />
              <span className="text-muted text-[11px] font-semibold uppercase tracking-wide">
                {JOB_TRIGGER_LABELS[detail.trigger]}
              </span>
            </div>

            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <Row label="Inicio" value={formatRunDateTime(detail.startedAtUtc)} />
              <Row label="Fin" value={formatRunDateTime(detail.finishedAtUtc)} />
              <Row label="Duración" value={formatDuration(detail.durationMs)} />
              <Row label="Procesados" value={String(detail.itemsProcessed)} />
              <Row label="Con error" value={String(detail.itemsFailed)} />
              <Row label="Solicitó" value={detail.requestedBy ?? "—"} />
              <Row label="Código de resultado" value={detail.outcomeCode ?? "—"} mono />
              <Row label="Tipo de fallo" value={detail.failureType ?? "—"} mono />
              <Row label="Clave del job" value={detail.jobKey} mono />
              <Row label="Inicio (UTC)" value={detail.startedAtUtc} mono />
            </dl>

            <p className="text-muted mt-4 border-t border-[var(--color-border)] pt-2 text-[11px] leading-relaxed">
              No se muestran mensajes de error ni contenido de correo: solo el tipo de fallo y el código del resultado.
            </p>
          </>
        ) : null}
      </section>
    </div>
  );
}
