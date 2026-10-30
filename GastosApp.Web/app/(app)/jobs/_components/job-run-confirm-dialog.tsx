"use client";

import { useEffect, useRef } from "react";
import { Mail, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobCatalogItem } from "@/lib/contracts/jobs";
import { MANUAL_RUN_REASON_MAX_LENGTH } from "@/lib/contracts/jobs";

type Props = {
  job: JobCatalogItem | null;
  reason: string;
  reasonError: string | null;
  submitting: boolean;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Confirmación explícita antes de ejecutar (S3).
 *
 * El diálogo no solo pregunta: enumera lo que va a pasar. Una corrida manual usa la misma
 * configuración y las mismas protecciones de negocio que el horario automático, no se encola, y en
 * el pase de correo adelanta el cursor en memoria que comparte con el pase automático.
 */
export function JobRunConfirmDialog({ job, reason, reasonError, submitting, onReasonChange, onCancel, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const jobKey = job?.jobKey ?? null;

  useEffect(() => {
    if (jobKey === null) return;

    // Escape cierra sin ejecutar: es la salida segura de un diálogo que dispara trabajo real. El
    // efecto depende de la clave del job, no del objeto: el sondeo del catálogo reemplaza el objeto
    // cada 15 s y re-enfocar el botón interrumpiría a quien está escribiendo el motivo.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    document.addEventListener("keydown", onKeyDown);
    cancelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [jobKey, onCancel]);

  if (!job) return null;

  const titleId = "job-run-confirm-title";
  const descriptionId = "job-run-confirm-description";
  const isEmailIngest = job.jobKey === "email_ingest";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-[var(--color-overlay)] p-4 backdrop-blur-sm"
      role="presentation"
      onClick={submitting ? undefined : onCancel}
    >
      <section
        className="app-panel w-full max-w-lg p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-primary text-sm font-semibold">
          ¿Ejecutar «{job.displayName}» ahora?
        </h2>

        <div id={descriptionId} className="text-secondary mt-2 space-y-2 text-xs leading-relaxed">
          <p>
            La corrida queda registrada en el historial antes de ejecutarse. La API responde en cuanto la abre, no
            cuando termina, así que el resultado se consulta en el historial.
          </p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Usa la configuración y el dueño actuales, y respeta las protecciones de negocio del job.</li>
            <li>El horario automático no estorba: apagarlo no prohíbe esta corrida.</li>
            <li>No se encola: si ya hay una corrida de este job en curso, la API la rechaza.</li>
            <li>Ninguna corrida se puede cancelar desde esta pantalla, y el historial no se borra.</li>
          </ul>
          {isEmailIngest ? (
            <p className="flex items-start gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-warning)]/35 bg-[var(--color-warning)]/10 px-2 py-1.5 text-[11px] text-secondary">
              <Mail className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
              <span>
                Comparte el cursor en memoria del pase automático de correo: esta corrida lo adelanta, así que el
                siguiente pase automático no vuelve a recorrer el correo ya procesado.
              </span>
            </p>
          ) : null}
        </div>

        <div className="mt-3 grid gap-1.5">
          <label htmlFor="job-run-reason" className="text-primary text-xs font-semibold">
            Motivo (opcional)
          </label>
          <textarea
            id="job-run-reason"
            className="input-semantic min-h-[64px] w-full px-2.5 py-2 text-xs"
            value={reason}
            maxLength={MANUAL_RUN_REASON_MAX_LENGTH}
            disabled={submitting}
            aria-describedby="job-run-reason-help"
            aria-invalid={Boolean(reasonError)}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Por qué se ejecuta a demanda"
          />
          <div className="flex items-start justify-between gap-2">
            <p id="job-run-reason-help" className={reasonError ? "text-[11px] text-[var(--color-danger)]" : "text-muted text-[11px]"}>
              {reasonError ?? "Para el registro del operador; la API no lo guarda en el historial."}
            </p>
            <span className="text-muted shrink-0 text-[11px] tabular-nums" aria-hidden="true">
              {reason.length}/{MANUAL_RUN_REASON_MAX_LENGTH}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button ref={cancelRef} type="button" variant="ghost" className="h-9" disabled={submitting} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" className="h-9" loading={submitting} loadingText="Iniciando..." onClick={onConfirm}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Sí, ejecutar ahora
          </Button>
        </div>
      </section>
    </div>
  );
}
