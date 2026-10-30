"use client";

import { useMemo } from "react";
import type { ColumnDef, PaginationState, Updater } from "@tanstack/react-table";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ACTIONS_COLUMN_ID } from "@/lib/ui/grid-responsive";
import {
  JOB_HISTORY_PAGE_SIZES,
  JOB_STATUSES,
  JOB_TRIGGERS,
  type JobCatalogItem,
  type JobHistoryPage,
  type JobRunSummary,
  type JobStatus,
  type JobTrigger
} from "@/lib/contracts/jobs";
import {
  formatDuration,
  formatRunDateTime,
  formatRunItems,
  JOB_STATUS_LABELS,
  JOB_TRIGGER_LABELS
} from "../_lib/jobs-ui";
import { JobStatusBadge, JobTriggerBadge } from "./job-status-badge";

type HistoryControls = {
  filters: { jobKey: string; status: string; trigger: string; page: number; pageSize: number };
  data: JobHistoryPage | null;
  loading: boolean;
  error: string | null;
  setJobKey: (jobKey: JobCatalogItem["jobKey"] | "all") => void;
  setStatus: (status: JobStatus | "all") => void;
  setTrigger: (trigger: JobTrigger | "all") => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  reload: () => void;
};

type Props = {
  jobs: JobCatalogItem[];
  history: HistoryControls;
  onOpenRun: (jobRunId: number) => void;
};

const pagerButtonClass =
  "btn-secondary-semantic h-7 px-2 text-[11px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]";

/**
 * Historial paginado en el servidor. La tabla no ordena localmente: el orden (más reciente primero)
 * lo decide la API y la paginación es del servidor, así que reordenar solo la página visible mentiría
 * sobre el resto del historial. Por eso las columnas no son ordenables.
 */
export function JobsHistory({ jobs, history, onOpenRun }: Props) {
  const jobNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const job of jobs) map.set(job.jobKey, job.displayName);
    return map;
  }, [jobs]);

  const columns = useMemo<ColumnDef<JobRunSummary>[]>(
    () => [
      {
        accessorKey: "startedAtUtc",
        header: "Inicio",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="text-primary text-xs tabular-nums" title={row.original.startedAtUtc}>
              {formatRunDateTime(row.original.startedAtUtc)}
            </p>
            <p className="text-muted text-[10px]">#{row.original.jobRunId}</p>
          </div>
        )
      },
      {
        accessorKey: "jobKey",
        header: "Job",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="text-primary text-xs font-semibold">{jobNames.get(row.original.jobKey) ?? row.original.jobKey}</p>
            <p className="text-muted font-mono text-[10px]">{row.original.jobKey}</p>
          </div>
        )
      },
      {
        accessorKey: "trigger",
        header: "Origen",
        enableSorting: false,
        cell: ({ row }) => <JobTriggerBadge trigger={row.original.trigger} />
      },
      {
        accessorKey: "status",
        header: "Estado",
        enableSorting: false,
        cell: ({ row }) => <JobStatusBadge status={row.original.status} />
      },
      {
        accessorKey: "durationMs",
        header: "Duración",
        enableSorting: false,
        cell: ({ row }) => <span className="text-secondary text-xs tabular-nums">{formatDuration(row.original.durationMs)}</span>
      },
      {
        id: "items",
        header: "Items",
        enableSorting: false,
        cell: ({ row }) => <span className="text-secondary text-xs tabular-nums">{formatRunItems(row.original)}</span>
      },
      {
        accessorKey: "requestedBy",
        header: "Solicitó",
        enableSorting: false,
        cell: ({ row }) => <span className="text-secondary text-xs">{row.original.requestedBy ?? "—"}</span>
      },
      {
        id: "result",
        header: "Resultado",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted font-mono text-[10px]">{row.original.outcomeCode ?? row.original.failureType ?? "—"}</span>
        )
      },
      {
        id: ACTIONS_COLUMN_ID,
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => onOpenRun(row.original.jobRunId)}
            aria-label={`Ver detalle de la corrida ${row.original.jobRunId}`}
          >
            Ver detalle
          </Button>
        )
      }
    ],
    [jobNames, onOpenRun]
  );

  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: Math.max(0, history.filters.page - 1), pageSize: history.filters.pageSize }),
    [history.filters.page, history.filters.pageSize]
  );

  const handlePagination = (updater: Updater<PaginationState>) => {
    const next = typeof updater === "function" ? updater(pagination) : updater;
    if (next.pageSize !== pagination.pageSize) {
      history.setPageSize(next.pageSize);
      return;
    }
    history.setPage(next.pageIndex + 1);
  };

  const page = history.data?.page ?? history.filters.page;
  const totalPages = history.data?.totalPages ?? 0;
  const totalCount = history.data?.totalCount ?? 0;
  const canGoBack = page > 1;
  const canGoForward = totalPages > 0 && page < totalPages;

  return (
    <Card className="app-panel space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-primary text-sm font-semibold">Historial de ejecuciones</h2>
          <p className="text-muted mt-0.5 text-[11px]">
            El historial se conserva completo: esta pantalla solo lee y pagina, no borra corridas.
          </p>
        </div>
        <Button type="button" variant="ghost" className="h-8 px-2 text-[11px]" onClick={history.reload}>
          Actualizar historial
        </Button>
      </div>

      <div className="grid gap-2 lg:grid-cols-[1fr_150px_150px_130px_auto] lg:items-end">
        <label className="text-secondary grid gap-1 text-xs font-medium uppercase tracking-wide">
          Job
          <select
            className="input-semantic h-8 rounded-none px-2.5 text-xs font-semibold"
            value={history.filters.jobKey}
            onChange={(event) => history.setJobKey(event.target.value as JobCatalogItem["jobKey"] | "all")}
          >
            <option value="all">Todos</option>
            {jobs.map((job) => (
              <option key={job.jobKey} value={job.jobKey}>
                {job.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="text-secondary grid gap-1 text-xs font-medium uppercase tracking-wide">
          Estado
          <select
            className="input-semantic h-8 rounded-none px-2.5 text-xs font-semibold"
            value={history.filters.status}
            onChange={(event) => history.setStatus(event.target.value as JobStatus | "all")}
          >
            <option value="all">Todos</option>
            {JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {JOB_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-secondary grid gap-1 text-xs font-medium uppercase tracking-wide">
          Origen
          <select
            className="input-semantic h-8 rounded-none px-2.5 text-xs font-semibold"
            value={history.filters.trigger}
            onChange={(event) => history.setTrigger(event.target.value as JobTrigger | "all")}
          >
            <option value="all">Todos</option>
            {JOB_TRIGGERS.map((trigger) => (
              <option key={trigger} value={trigger}>
                {JOB_TRIGGER_LABELS[trigger]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-secondary grid gap-1 text-xs font-medium uppercase tracking-wide">
          Filas
          <select
            className="input-semantic h-8 rounded-none px-2.5 text-xs font-semibold"
            value={history.filters.pageSize}
            onChange={(event) => history.setPageSize(Number(event.target.value))}
          >
            {JOB_HISTORY_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <Button
          type="button"
          variant="ghost"
          className="btn-secondary-semantic h-8 px-2.5 text-[11px] font-bold"
          onClick={() => {
            history.setJobKey("all");
            history.setStatus("all");
            history.setTrigger("all");
          }}
        >
          Limpiar filtros
        </Button>
      </div>

      <DataGrid
        columns={columns}
        rows={history.data?.items ?? []}
        mode="server"
        manualPagination
        pagination={pagination}
        onPaginationChange={handlePagination}
        rowCount={totalCount}
        loading={history.loading}
        errorMessage={history.error}
        emptyMessage="No hay corridas con los filtros actuales."
        density="compact"
        mobileCards={(row, actions) => (
          <Card className="space-y-1.5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-primary text-xs font-semibold">{jobNames.get(row.jobKey) ?? row.jobKey}</p>
                <p className="text-muted text-[10px]" title={row.startedAtUtc}>
                  {formatRunDateTime(row.startedAtUtc)} · #{row.jobRunId}
                </p>
              </div>
              <JobStatusBadge status={row.status} />
            </div>
            <div className="text-muted flex flex-wrap items-center gap-2 text-[11px]">
              <JobTriggerBadge trigger={row.trigger} />
              <span>{formatDuration(row.durationMs)}</span>
              <span>{formatRunItems(row)}</span>
            </div>
            {row.outcomeCode ?? row.failureType ? (
              <p className="text-muted font-mono text-[10px]">{row.outcomeCode ?? row.failureType}</p>
            ) : null}
            <div className="flex justify-end">{actions}</div>
          </Card>
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-[var(--radius-md)] border-x border-b border-strong bg-[var(--table-surface-bg)] px-2 py-1.5">
        <p className="text-muted text-[11px]">
          {totalCount === 0 ? "Sin corridas" : `${totalCount} corridas · página ${page} de ${Math.max(totalPages, 1)}`}
        </p>
        <div className="flex items-center gap-1.5">
          <button type="button" className={pagerButtonClass} onClick={() => history.setPage(page - 1)} disabled={!canGoBack || history.loading}>
            Anterior
          </button>
          <span className="text-muted text-[11px]">
            Página {page} de {Math.max(totalPages, 1)}
          </span>
          <button type="button" className={pagerButtonClass} onClick={() => history.setPage(page + 1)} disabled={!canGoForward || history.loading}>
            Siguiente
          </button>
        </div>
      </div>
    </Card>
  );
}
