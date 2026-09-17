"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, BellOff, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import type { AlertDelivery, AlertOutboxEntry } from "@/lib/contracts/alerts";
import { formatCurrency } from "@/lib/format/currency";
import {
  deliveryStatusBadgeClass,
  deliveryStatusLabel,
  formatDeliveryDate,
  formatPercent
} from "../_lib/budgets-ui";

type Props = {
  deliveries: AlertDelivery[];
  failedByDeliveryId: Map<number, AlertOutboxEntry>;
  loading: boolean;
  errorMessage: string | null;
  retryingId: number | null;
  periodLabel: string;
  onRetry: (deliveryId: number) => void;
};

/**
 * El reintento solo existe para entregas cuya fila de outbox sigue en `failed`.
 * El contrato nunca expone `payload` ni `lastError`: aquí solo se muestran snapshots financieros.
 */
function RetryAction({
  delivery,
  failedEntry,
  retryingId,
  onRetry
}: {
  delivery: AlertDelivery;
  failedEntry: AlertOutboxEntry | undefined;
  retryingId: number | null;
  onRetry: (deliveryId: number) => void;
}) {
  if (!failedEntry) {
    return <span className="text-muted text-[11px] font-medium">Sin acción</span>;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-8 border px-2 text-[11px] font-semibold border-[var(--color-warning)]/50 bg-[var(--color-warning)]/15 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/25"
      loading={retryingId === failedEntry.outboxId}
      loadingText="Reintentando..."
      onClick={() => onRetry(delivery.deliveryId)}
      aria-label={`Reintentar el envío de la alerta de ${delivery.budgetName}`}
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Reintentar</span>
    </Button>
  );
}

export function AlertsHistoryPanel({ deliveries, failedByDeliveryId, loading, errorMessage, retryingId, periodLabel, onRetry }: Props) {
  const columns = useMemo<ColumnDef<AlertDelivery>[]>(
    () => [
      {
        id: "budget",
        header: "Presupuesto",
        accessorFn: (row) => row.budgetName,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="m-0 text-xs font-bold text-primary">{row.original.budgetName}</p>
            <p className="m-0 text-[11px] text-muted">{row.original.periodKey}</p>
          </div>
        )
      },
      {
        id: "threshold",
        header: "Umbral",
        accessorFn: (row) => row.thresholdName,
        cell: ({ row }) => (
          <span className="text-xs font-medium text-secondary">
            {row.original.thresholdName} ({formatPercent(row.original.thresholdPercent)})
          </span>
        )
      },
      {
        id: "percentUsed",
        header: "% al disparar",
        accessorFn: (row) => row.percentUsed,
        cell: ({ row }) => <span className="tabular-nums text-xs font-semibold">{formatPercent(row.original.percentUsed)}</span>
      },
      {
        id: "spent",
        header: "Gasto del periodo",
        accessorFn: (row) => row.spentAmount,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="m-0 text-xs font-semibold tabular-nums text-primary">{formatCurrency(row.original.spentAmount)}</p>
            <p className="m-0 text-[11px] text-muted">de {formatCurrency(row.original.budgetAmount)}</p>
          </div>
        )
      },
      {
        id: "createdAt",
        header: "Fecha",
        accessorFn: (row) => row.createdAt ?? "",
        cell: ({ row }) => <span className="text-xs font-medium text-secondary">{formatDeliveryDate(row.original.createdAt)}</span>
      },
      {
        id: "outboxStatus",
        header: "Entrega",
        accessorFn: (row) => row.outboxStatus ?? "",
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <span className={deliveryStatusBadgeClass(row.original.outboxStatus)}>{deliveryStatusLabel(row.original.outboxStatus)}</span>
            {row.original.sentAt ? <span className="text-[11px] font-medium text-muted">{formatDeliveryDate(row.original.sentAt)}</span> : null}
          </div>
        )
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <RetryAction
            delivery={row.original}
            failedEntry={failedByDeliveryId.get(row.original.deliveryId)}
            retryingId={retryingId}
            onRetry={onRetry}
          />
        )
      }
    ],
    [failedByDeliveryId, onRetry, retryingId]
  );

  if (errorMessage) {
    return (
      <div className="border-[var(--color-danger)]/35 bg-[var(--color-danger)]/12 p-4 text-[var(--color-danger)]" role="alert" aria-live="assertive">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Error al cargar el historial</p>
            <p className="mt-1 text-xs font-medium">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!loading && deliveries.length === 0) {
    return (
      <section className="app-panel flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <BellOff className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 className="m-0 text-base font-semibold text-primary">Sin alertas en {periodLabel}</h2>
          <p className="m-0 max-w-md text-sm text-muted">
            Cuando el gasto de un presupuesto cruce un umbral, la alerta aparecerá aquí con su estado de entrega por Telegram.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-busy={loading} className="space-y-3">
      <p className="app-panel m-0 px-3 py-2 text-[11px] font-medium text-muted">
        Las alertas se entregan por Telegram de forma asíncrona: una entrega pendiente puede tardar y el historial no refleja el envío en tiempo real.
      </p>

      <ul className="space-y-2.5 md:hidden">
        {loading
          ? Array.from({ length: 3 }).map((_, index) => (
              <li key={index} className="animate-pulse border border-default bg-[var(--color-surface-2)] p-3">
                <div className="h-3 w-32 rounded-none bg-[var(--color-surface-3)]" />
                <div className="mt-2 h-2.5 w-44 rounded-none bg-[var(--color-surface-3)]" />
                <div className="mt-3 h-8 rounded-none bg-[var(--color-surface-3)]" />
              </li>
            ))
          : deliveries.map((delivery) => (
              <li key={delivery.deliveryId}>
                <article className="dashboard-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="m-0 truncate text-sm font-bold text-primary">{delivery.budgetName}</h3>
                      <p className="m-0 text-[11px] font-medium text-muted">
                        {delivery.thresholdName} ({formatPercent(delivery.thresholdPercent)}) · {delivery.periodKey}
                      </p>
                    </div>
                    <span className={deliveryStatusBadgeClass(delivery.outboxStatus)}>{deliveryStatusLabel(delivery.outboxStatus)}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="dashboard-subtle p-2">
                      <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Gasto del periodo</p>
                      <p className="m-0 text-sm font-bold tabular-nums text-primary">{formatCurrency(delivery.spentAmount)}</p>
                      <p className="m-0 text-[10px] font-medium text-muted">de {formatCurrency(delivery.budgetAmount)}</p>
                    </div>
                    <div className="dashboard-subtle p-2">
                      <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-muted">% al disparar</p>
                      <p className="m-0 text-sm font-bold tabular-nums text-primary">{formatPercent(delivery.percentUsed)}</p>
                      <p className="m-0 text-[10px] font-medium text-muted">{formatDeliveryDate(delivery.createdAt)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <RetryAction
                      delivery={delivery}
                      failedEntry={failedByDeliveryId.get(delivery.deliveryId)}
                      retryingId={retryingId}
                      onRetry={onRetry}
                    />
                  </div>
                </article>
              </li>
            ))}
      </ul>

      <div className="hidden md:block">
        <div className="app-grid-skin app-grid-skin-flat overflow-hidden rounded-none p-0">
          <DataGrid
            columns={columns}
            rows={deliveries}
            loading={loading}
            mode="client"
            density="compact"
            emptyMessage="Sin alertas en el periodo"
            stickyHeader
            stickyActionsColumn
          />
        </div>
      </div>
    </section>
  );
}
