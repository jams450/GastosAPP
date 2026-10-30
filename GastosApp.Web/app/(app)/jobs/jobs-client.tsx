"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/navigation/page-header";
import {
  emptyJobStatusCounts,
  validateManualRunReason,
  type JobCatalogItem
} from "@/lib/contracts/jobs";
import { formatRunDateTime } from "./_lib/jobs-ui";
import { JobCard } from "./_components/job-card";
import { JobRunConfirmDialog } from "./_components/job-run-confirm-dialog";
import { JobRunDetailDialog } from "./_components/job-run-detail-dialog";
import { JobsHistory } from "./_components/jobs-history";
import { JobsSummary } from "./_components/jobs-summary";
import { JobsToastStack } from "./_components/jobs-toast-stack";
import { useJobsCatalog } from "./_hooks/use-jobs-catalog";
import { useJobsHistory } from "./_hooks/use-jobs-history";
import { useJobsToasts } from "./_hooks/use-jobs-toasts";
import { useManualRun } from "./_hooks/use-manual-run";

/**
 * Pantalla administrativa de monitoreo de los cinco jobs (S1/S2/S3).
 *
 * Toda la información operativa viene del catálogo y del historial de la API; la pantalla no deduce
 * horarios, permisos ni dueños. La única acción es ejecutar a demanda, y siempre pasa por una
 * confirmación explícita.
 */
export function JobsClient() {
  const catalog = useJobsCatalog();
  const history = useJobsHistory();
  const manual = useManualRun();
  const { toasts, dismissToast, success, error: errorToast } = useJobsToasts();

  const [confirmJob, setConfirmJob] = useState<JobCatalogItem | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [detailRunId, setDetailRunId] = useState<number | null>(null);

  const jobs = catalog.overview?.jobs ?? [];
  const totals = catalog.overview?.totals ?? emptyJobStatusCounts();
  const refreshCatalog = catalog.refresh;
  const reloadHistory = history.reload;
  const setHistoryPage = history.setPage;
  const historyPage = history.filters.page;
  const historyTotalPages = history.data?.totalPages ?? 0;

  const refreshAfterRun = useCallback(async () => {
    // El catálogo pinta la corrida en curso y el historial la confirma: se refrescan los dos.
    await Promise.all([refreshCatalog(), Promise.resolve(reloadHistory())]);
  }, [refreshCatalog, reloadHistory]);

  // Si el historial se acorta (filtros o nueva página), una página fuera de rango no debe dejar la
  // tabla vacía sin salida.
  useEffect(() => {
    if (historyTotalPages > 0 && historyPage > historyTotalPages) {
      setHistoryPage(historyTotalPages);
    }
  }, [historyTotalPages, historyPage, setHistoryPage]);

  const requestRun = useCallback((job: JobCatalogItem) => {
    setConfirmJob(job);
    setReason("");
    setReasonError(null);
  }, []);

  // Identidad estable mientras no haya una corrida en vuelo: el diálogo re-enfoca su botón seguro
  // cuando cambia `onCancel`, y eso no debe ocurrir al escribir el motivo.
  const closeConfirm = useCallback(() => {
    if (manual.isPending) return;
    setConfirmJob(null);
    setReasonError(null);
  }, [manual.isPending]);

  const closeDetail = useCallback(() => setDetailRunId(null), []);

  const confirmRun = async () => {
    if (!confirmJob || manual.isPending) return;

    const validated = validateManualRunReason(reason);
    if (!validated.ok) {
      setReasonError(validated.message);
      return;
    }

    const outcome = await manual.run(confirmJob.jobKey, validated.reason);
    if (outcome.kind === "ignored") return;

    setConfirmJob(null);
    setReasonError(null);

    if (outcome.kind === "accepted") {
      success(`Corrida #${outcome.accepted.jobRunId} iniciada. El resultado aparecerá en el historial.`);
      void refreshAfterRun();
      return;
    }

    if (outcome.kind === "conflict") {
      const current = outcome.error.currentRunId ? ` (corrida #${outcome.error.currentRunId})` : "";
      errorToast(`El job ya está en ejecución${current}. No se abrió otra corrida ni se puso en cola.`);
      void refreshAfterRun();
      return;
    }

    if (outcome.kind === "rejected") {
      errorToast(outcome.error.message);
      reloadHistory();
      return;
    }

    // Incierto: la guarda del hook ya bloquea una nueva corrida de este job. Solo se refresca el
    // historial para que el operador confirme qué pasó; nunca se reintenta solo.
    errorToast("No pudimos confirmar si la corrida se registró. Revisa el historial.");
    void refreshAfterRun();
  };

  return (
    <>
      <PageHeader
        section="Administración"
        title="Monitoreo de jobs"
        subtitle="Estado, historial y ejecución a demanda de los procesos automáticos. Solo administradores."
        meta={
          catalog.overview?.generatedAtUtc ? (
            <p className="text-muted text-[11px]" title={catalog.overview.generatedAtUtc}>
              Datos de {formatRunDateTime(catalog.overview.generatedAtUtc)}
              {catalog.refreshing ? " · actualizando…" : ""}
            </p>
          ) : null
        }
        actions={
          <Button type="button" variant="ghost" className="h-8 px-2.5 text-[11px] font-bold" loading={catalog.refreshing} loadingText="Actualizando..." onClick={() => void catalog.refresh()}>
            Actualizar datos
          </Button>
        }
      />

      <JobsToastStack toasts={toasts} onDismiss={dismissToast} />

      <Alert variant="info">
        <p className="font-semibold">Ejecutar a demanda no cambia la configuración.</p>
        <p className="mt-0.5 text-[11px] leading-relaxed">
          La corrida manual usa la misma configuración, el mismo dueño y las mismas protecciones que el horario
          automático; si una protección aplica, queda como omitida. El horario apagado no impide ejecutar. Las corridas
          no se encolan y esta pantalla nunca reintenta sola. El historial se conserva: no hay retención destructiva.
        </p>
      </Alert>

      {manual.uncertainNotice ? (
        <Alert variant="danger">
          <p className="font-semibold">{manual.uncertainNotice}</p>
          <p className="mt-0.5 text-[11px]">
            No se envió otra petición. Confirma en el historial si la corrida aparece y luego habilita el botón otra vez.
          </p>
          <div className="mt-2">
            <Button type="button" variant="ghost" className="h-7 px-2 text-[11px] font-bold" onClick={manual.acknowledgeUncertain}>
              Ya revisé el historial
            </Button>
          </div>
        </Alert>
      ) : null}

      {catalog.error && !catalog.overview ? (
        <Alert variant="danger">
          <p className="font-semibold">No se pudo leer el catálogo de jobs.</p>
          <p className="mt-0.5 text-[11px]">{catalog.error}</p>
          <div className="mt-2">
            <Button type="button" variant="ghost" className="h-7 px-2 text-[11px] font-bold" onClick={() => void catalog.refresh()}>
              Reintentar
            </Button>
          </div>
        </Alert>
      ) : null}

      <JobsSummary totals={totals} />

      <section className="space-y-2" aria-label="Estado por job">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-primary text-sm font-semibold">Jobs monitoreados</h2>
            <p className="text-muted mt-0.5 text-[11px]">
              Cinco procesos con clave estable. Una corrida en curso deshabilita el botón de ejecución de ese job.
            </p>
          </div>
          {catalog.loading ? <p className="text-muted text-[11px]">Cargando catálogo…</p> : null}
        </div>

        {catalog.loading && !catalog.overview ? (
          <p className="text-muted p-3 text-xs">Cargando catálogo de jobs…</p>
        ) : jobs.length === 0 ? (
          <p className="text-muted p-3 text-xs">La API no publicó jobs en el catálogo.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {jobs.map((job) => (
              <JobCard
                key={job.jobKey}
                job={job}
                runPending={manual.pendingJobKey === job.jobKey}
                runBlocked={manual.blockedJobKey === job.jobKey}
                onRequestRun={requestRun}
                onOpenRun={setDetailRunId}
              />
            ))}
          </div>
        )}
      </section>

      <JobsHistory jobs={jobs} history={history} onOpenRun={setDetailRunId} />

      <JobRunConfirmDialog
        job={confirmJob}
        reason={reason}
        reasonError={reasonError}
        submitting={manual.isPending}
        onReasonChange={(value) => {
          setReason(value);
          setReasonError(null);
        }}
        onCancel={closeConfirm}
        onConfirm={() => void confirmRun()}
      />

      <JobRunDetailDialog jobRunId={detailRunId} onClose={closeDetail} />
    </>
  );
}
