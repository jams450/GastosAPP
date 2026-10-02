"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, Link2, ListChecks, RotateCcw, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import type { BudgetItemSuggestion } from "@/lib/contracts/budget-items";
import { formatCurrency } from "@/lib/format/currency";
import {
  describeSuggestionContext,
  describeSuggestionScope,
  formatPlannedDateLabel,
  formatTransactionDateLabel,
  suggestionDistanceLabel,
  suggestionKindBadgeClass,
  suggestionKindLabel,
  suggestionRowKey,
  suggestionStrengthBadgeClass,
  suggestionStrengthLabel,
  type SuggestionCatalogs
} from "../_lib/budget-suggestions-model";

type Props = {
  suggestions: BudgetItemSuggestion[];
  loading: boolean;
  errorMessage: string | null;
  periodLabel: string;
  catalogs: SuggestionCatalogs;
  onRetry: () => void;
  /** Lleva a la pestaña de partidas, que sí sabe escribir sobre la partida. Solo navegación. */
  onOpenItem: () => void;
};

function SuggestionSkeleton() {
  return (
    <div className="space-y-2.5" role="status" aria-live="polite" aria-label="Cargando sugerencias del periodo">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="animate-pulse border border-default bg-[var(--color-surface-2)] p-3">
          <div className="h-3 w-40 rounded-none bg-[var(--color-surface-3)]" />
          <div className="mt-2 h-2.5 w-56 rounded-none bg-[var(--color-surface-3)]" />
          <div className="mt-3 h-8 rounded-none bg-[var(--color-surface-3)]" />
        </div>
      ))}
    </div>
  );
}

/** La fila no ofrece "enlazar": el backend no expone ese endpoint. Solo lleva a la partida. */
function OpenItemAction({ suggestion, onOpenItem }: { suggestion: BudgetItemSuggestion; onOpenItem: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-8 border px-2 text-[11px] font-semibold border-blue-400/60 bg-blue-500/15 text-blue-700 hover:border-blue-500/70 hover:bg-blue-500/25 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-300"
      onClick={onOpenItem}
      aria-label={`Ver la partida ${suggestion.name} en la pestaña de partidas`}
    >
      <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Ver en partidas</span>
    </Button>
  );
}

/**
 * Sugerencias de enlace partida ↔ transacción.
 *
 * **Solo lectura.** El backend devuelve pares *débiles* (misma categoría o subcategoría del mismo
 * mes) y deliberadamente no los enlaza: la fuerza débil no identifica. No existe ningún endpoint
 * para enlazar a mano, así que esta vista no finge uno; la fila ofrece lo único real y no
 * destructivo —ir a la partida para decidir ahí— y el texto explica por qué no hay botón de enlace.
 */
export function BudgetSuggestionsPanel({ suggestions, loading, errorMessage, periodLabel, catalogs, onRetry, onOpenItem }: Props) {
  const columns = useMemo<ColumnDef<BudgetItemSuggestion>[]>(
    () => [
      {
        id: "item",
        header: "Partida",
        accessorFn: (row) => row.name,
        cell: ({ row }) => {
          const scope = describeSuggestionScope(row.original, catalogs);
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="m-0 text-xs font-bold text-primary">{row.original.name}</p>
                <span className={suggestionKindBadgeClass(row.original.kind)}>{suggestionKindLabel(row.original.kind)}</span>
              </div>
              <p className="m-0 text-[11px] text-muted">
                {scope.label}
                {scope.hint ? ` · ${scope.hint}` : ""} · {row.original.periodKey}
              </p>
            </div>
          );
        }
      },
      {
        id: "plannedAmount",
        header: "Monto planeado",
        accessorFn: (row) => row.plannedAmount,
        cell: ({ row }) => <span className="tabular-nums font-semibold">{formatCurrency(row.original.plannedAmount)}</span>
      },
      {
        id: "plannedDate",
        header: "Fecha planeada",
        accessorFn: (row) => row.plannedDate ?? "",
        cell: ({ row }) => <span className="text-xs font-medium text-secondary">{formatPlannedDateLabel(row.original.plannedDate)}</span>
      },
      {
        id: "transaction",
        header: "Transacción candidata",
        accessorFn: (row) => row.transactionId,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="m-0 text-xs font-semibold tabular-nums text-primary">{formatCurrency(row.original.transactionAmount)}</p>
            <p className="m-0 text-[11px] text-muted">
              {formatTransactionDateLabel(row.original.transactionDate)} · #{row.original.transactionId}
            </p>
          </div>
        )
      },
      {
        id: "match",
        header: "Coincidencia",
        accessorFn: (row) => row.distanceDays,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <span className={suggestionStrengthBadgeClass(row.original.strength)}>{suggestionStrengthLabel(row.original.strength)}</span>
            <span className="text-[11px] font-medium text-muted">{suggestionDistanceLabel(row.original.distanceDays)}</span>
          </div>
        )
      },
      {
        id: "context",
        header: "Cuenta y comercio",
        enableSorting: false,
        accessorFn: (row) => describeSuggestionContext(row, catalogs).account ?? "",
        cell: ({ row }) => {
          const context = describeSuggestionContext(row.original, catalogs);
          if (!context.account && !context.merchant) {
            return <span className="text-[11px] font-medium text-muted">Sin cuenta ni comercio</span>;
          }

          return (
            <div className="min-w-0">
              <p className="m-0 text-xs font-medium text-secondary">{context.account ?? "Sin cuenta"}</p>
              <p className="m-0 text-[11px] text-muted">{context.merchant ?? "Sin comercio"}</p>
            </div>
          );
        }
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => <OpenItemAction suggestion={row.original} onOpenItem={onOpenItem} />
      }
    ],
    [catalogs, onOpenItem]
  );

  if (errorMessage) {
    return (
      <div className="border-[var(--color-danger)]/35 bg-[var(--color-danger)]/12 p-4 text-[var(--color-danger)]" role="alert" aria-live="assertive">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-2">
            <p className="m-0 text-sm font-bold">Error al cargar las sugerencias</p>
            <p className="m-0 text-xs font-medium">{errorMessage}</p>
            <Button
              type="button"
              variant="ghost"
              className="h-8 border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/15 px-2 text-[11px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25"
              onClick={onRetry}
              aria-label="Reintentar la carga de sugerencias del periodo"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reintentar</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!loading && suggestions.length === 0) {
    return (
      <section
        className="app-panel flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center"
        aria-label="Sugerencias de enlace del periodo"
      >
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 className="m-0 text-base font-semibold text-primary">Sin sugerencias en {periodLabel}</h2>
          <p className="m-0 max-w-md text-sm text-muted">
            No hay partidas pendientes sin enlazar que compartan categoría y mes con un movimiento registrado. Cuando las haya, el par aparecerá aquí para que decidas.
          </p>
        </div>
      </section>
    );
  }

  if (loading) {
    return <SuggestionSkeleton />;
  }

  return (
    <section className="space-y-3" aria-label="Sugerencias de enlace entre partidas y transacciones" aria-busy={loading}>
      <p className="app-panel m-0 flex items-start gap-2 px-3 py-2 text-[11px] font-medium text-muted">
        <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Sugerencias de solo lectura: el enlace débil no identifica la partida, así que nada se enlaza solo. Revisa cada par y, si aplica, atiende la partida en su pestaña.
        </span>
      </p>

      <ul className="space-y-2.5 md:hidden">
        {suggestions.map((suggestion) => {
          const scope = describeSuggestionScope(suggestion, catalogs);
          const context = describeSuggestionContext(suggestion, catalogs);

          return (
            <li key={suggestionRowKey(suggestion)}>
              <article className="dashboard-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="m-0 truncate text-sm font-bold text-primary">{suggestion.name}</h3>
                    <p className="m-0 text-[11px] font-medium text-muted">
                      {scope.label}
                      {scope.hint ? ` · ${scope.hint}` : ""} · {suggestion.periodKey}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={suggestionStrengthBadgeClass(suggestion.strength)}>{suggestionStrengthLabel(suggestion.strength)}</span>
                    <span className={suggestionKindBadgeClass(suggestion.kind)}>{suggestionKindLabel(suggestion.kind)}</span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="dashboard-subtle p-2">
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Partida</p>
                    <p className="m-0 text-sm font-bold tabular-nums text-primary">{formatCurrency(suggestion.plannedAmount)}</p>
                    <p className="m-0 text-[10px] font-medium text-muted">{formatPlannedDateLabel(suggestion.plannedDate)}</p>
                  </div>
                  <div className="dashboard-subtle p-2">
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Transacción #{suggestion.transactionId}</p>
                    <p className="m-0 text-sm font-bold tabular-nums text-primary">{formatCurrency(suggestion.transactionAmount)}</p>
                    <p className="m-0 text-[10px] font-medium text-muted">{formatTransactionDateLabel(suggestion.transactionDate)}</p>
                  </div>
                </div>

                <p className="m-0 mt-2 text-[11px] font-medium text-muted">
                  {suggestionDistanceLabel(suggestion.distanceDays)}
                  {context.account ? ` · ${context.account}` : ""}
                  {context.merchant ? ` · ${context.merchant}` : ""}
                </p>

                <div className="mt-3 flex justify-end">
                  <OpenItemAction suggestion={suggestion} onOpenItem={onOpenItem} />
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <div className="hidden md:block">
        <div className="app-grid-skin app-grid-skin-flat overflow-hidden rounded-none p-0">
          <DataGrid
            columns={columns}
            rows={suggestions}
            loading={loading}
            mode="client"
            density="compact"
            emptyMessage="Sin sugerencias en el periodo"
            stickyHeader
            stickyActionsColumn
          />
        </div>
      </div>
    </section>
  );
}