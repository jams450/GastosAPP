"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, ClipboardList, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { toDateInputValue, type BudgetItem } from "@/lib/contracts/budget-items";
import { formatCurrency } from "@/lib/format/currency";
import { cn } from "@/lib/ui/cn";
import { tableActionStyles } from "@/lib/ui/table-action-styles";
import {
  budgetItemKindBadgeClass,
  budgetItemKindLabel,
  budgetItemStatusBadgeClass,
  budgetItemStatusLabel,
  getItemActions,
  type BudgetItemKindFilter
} from "../_lib/budget-items-model";
import type { BudgetItemCatalogIndex } from "../_hooks/use-budget-items";

type Props = {
  items: BudgetItem[];
  loading: boolean;
  errorMessage: string | null;
  kindFilter: BudgetItemKindFilter;
  busyItemId: number | null;
  catalogs: BudgetItemCatalogIndex;
  onKindFilterChange: (filter: BudgetItemKindFilter) => void;
  onCreate: () => void;
  onEdit: (item: BudgetItem) => void;
  onCancel: (item: BudgetItem) => void;
  onRestore: (item: BudgetItem) => void;
  onIgnore: (item: BudgetItem) => void;
};

const KIND_FILTERS: ReadonlyArray<{ id: BudgetItemKindFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "expense", label: "Gastos" },
  { id: "income", label: "Ingresos" }
];

function formatItemDate(value: string | null): string {
  const iso = toDateInputValue(value);
  if (!iso) {
    return "—";
  }

  // Se formatea en UTC para no correr el día: la fecha viene sin zona.
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}

function describeScope(item: BudgetItem, catalogs: BudgetItemCatalogIndex): { label: string; hint: string | null } {
  if (item.subcategoryId !== null) {
    const subcategory = catalogs.subcategoryById.get(item.subcategoryId);
    const parent = subcategory ? catalogs.categoryById.get(subcategory.categoryId) : undefined;
    return { label: subcategory?.name ?? `Subcategoría #${item.subcategoryId}`, hint: parent?.name ?? "Subcategoría" };
  }

  if (item.categoryId !== null) {
    const category = catalogs.categoryById.get(item.categoryId);
    return { label: category?.name ?? `Categoría #${item.categoryId}`, hint: "Categoría" };
  }

  return { label: "Sin alcance", hint: null };
}

export function BudgetItemsPanel({
  items,
  loading,
  errorMessage,
  kindFilter,
  busyItemId,
  catalogs,
  onKindFilterChange,
  onCreate,
  onEdit,
  onCancel,
  onRestore,
  onIgnore
}: Props) {
  const [showCancelled, setShowCancelled] = useState(false);

  const visibleItems = useMemo(
    () => (showCancelled ? items : items.filter((item) => item.status !== "cancelled")),
    [items, showCancelled]
  );

  const columns = useMemo<ColumnDef<BudgetItem>[]>(
    () => [
      {
        id: "name",
        header: "Partida",
        accessorFn: (row) => row.name,
        cell: ({ row }) => {
          const scope = describeScope(row.original, catalogs);
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="m-0 text-xs font-bold text-primary">{row.original.name}</p>
                {row.original.isProjected ? <span className="tabler-badge">Proyectada</span> : null}
                {row.original.source === "template" ? <span className="tabler-badge">Programada</span> : null}
              </div>
              <p className="m-0 text-[11px] text-muted">
                {scope.label}
                {scope.hint ? ` · ${scope.hint}` : ""}
              </p>
            </div>
          );
        }
      },
      {
        id: "kind",
        header: "Tipo",
        accessorFn: (row) => row.kind,
        cell: ({ row }) => <span className={budgetItemKindBadgeClass(row.original.kind)}>{budgetItemKindLabel(row.original.kind)}</span>
      },
      {
        id: "plannedAmount",
        header: "Planificado",
        accessorFn: (row) => row.plannedAmount,
        cell: ({ row }) => <span className="tabular-nums font-semibold">{formatCurrency(row.original.plannedAmount)}</span>
      },
      {
        id: "plannedDate",
        header: "Fecha",
        accessorFn: (row) => toDateInputValue(row.plannedDate),
        cell: ({ row }) => <span className="text-xs font-medium text-secondary">{formatItemDate(row.original.plannedDate)}</span>
      },
      {
        id: "status",
        header: "Estado",
        accessorFn: (row) => row.status,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <span className={budgetItemStatusBadgeClass(row.original.status)}>{budgetItemStatusLabel(row.original.status)}</span>
            {row.original.transactionId !== null ? <span className="text-[11px] font-medium text-muted">Con transacción</span> : null}
          </div>
        )
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <ItemActions
            item={row.original}
            busy={busyItemId === row.original.itemId}
            onEdit={onEdit}
            onCancel={onCancel}
            onRestore={onRestore}
            onIgnore={onIgnore}
          />
        )
      }
    ],
    [busyItemId, catalogs, onCancel, onEdit, onIgnore, onRestore]
  );

  if (errorMessage) {
    return (
      <div className="border-[var(--color-danger)]/35 bg-[var(--color-danger)]/12 p-4 text-[var(--color-danger)]" role="alert" aria-live="assertive">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Error al cargar partidas</p>
            <p className="mt-1 text-xs font-medium">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = !loading && visibleItems.length === 0 && !showCancelled;

  return (
    <section aria-busy={loading} className="space-y-3">
      <div className="app-panel flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar partidas por tipo">
          {KIND_FILTERS.map((filter) => {
            const isActive = filter.id === kindFilter;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onKindFilterChange(filter.id)}
                className={cn(
                  "focus-ring inline-flex h-7 items-center rounded-[var(--radius-sm)] border px-2.5 text-[11px] font-bold transition",
                  isActive
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                    : "border-default bg-[var(--color-surface-1)] text-muted hover:bg-[var(--color-accent-soft)] hover:text-primary"
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <label className="text-muted flex items-center gap-1.5 text-[11px] font-semibold">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(event) => setShowCancelled(event.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-accent)]"
          />
          Mostrar canceladas
        </label>
      </div>

      {isEmpty ? (
        <section className="app-panel flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h2 className="m-0 text-base font-semibold text-primary">Sin partidas en este periodo</h2>
            <p className="m-0 max-w-md text-sm text-muted">
              Planifica gastos o ingresos con fecha y cuenta para verlos reflejados como comprometido en el límite del mes.
            </p>
          </div>
          <Button type="button" variant="ghost" className={`h-9 rounded-none px-3 text-xs font-bold ${tableActionStyles.create}`} onClick={onCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Nueva partida
          </Button>
        </section>
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <li key={index} className="animate-pulse border border-default bg-[var(--color-surface-2)] p-3">
                    <div className="h-3 w-32 rounded-none bg-[var(--color-surface-3)]" />
                    <div className="mt-2 h-2.5 w-44 rounded-none bg-[var(--color-surface-3)]" />
                    <div className="mt-3 h-8 rounded-none bg-[var(--color-surface-3)]" />
                  </li>
                ))
              : visibleItems.map((item) => {
                  const scope = describeScope(item, catalogs);
                  return (
                    <li key={item.itemId}>
                      <article className="dashboard-card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="m-0 truncate text-sm font-bold text-primary">{item.name}</h3>
                            <p className="m-0 text-[11px] font-medium text-muted">
                              {scope.label}
                              {scope.hint ? ` · ${scope.hint}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className={budgetItemStatusBadgeClass(item.status)}>{budgetItemStatusLabel(item.status)}</span>
                            <span className={budgetItemKindBadgeClass(item.kind)}>{budgetItemKindLabel(item.kind)}</span>
                            {item.source === "template" ? <span className="tabler-badge">Programada</span> : null}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="dashboard-subtle p-2">
                            <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Planificado</p>
                            <p className="m-0 text-sm font-bold tabular-nums text-primary">{formatCurrency(item.plannedAmount)}</p>
                          </div>
                          <div className="dashboard-subtle p-2">
                            <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Fecha</p>
                            <p className="m-0 text-sm font-bold text-primary">{formatItemDate(item.plannedDate)}</p>
                          </div>
                        </div>

                        <div className="mt-3">
                          <ItemActions
                            item={item}
                            busy={busyItemId === item.itemId}
                            onEdit={onEdit}
                            onCancel={onCancel}
                            onRestore={onRestore}
                            onIgnore={onIgnore}
                            mobile
                          />
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
                rows={visibleItems}
                loading={loading}
                mode="client"
                density="compact"
                emptyMessage="Sin partidas para el filtro"
                stickyHeader
                stickyActionsColumn
                initialSorting={[{ id: "plannedDate", desc: false }]}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Acciones permitidas por estado. En `executed` y `cancelled` no se ofrece nada destructivo:
 * el backend responde 409 y la UI no debe dejar que el usuario choque con el conflicto.
 */
function ItemActions({
  item,
  busy,
  mobile = false,
  onEdit,
  onCancel,
  onRestore,
  onIgnore
}: {
  item: BudgetItem;
  busy: boolean;
  mobile?: boolean;
  onEdit: (item: BudgetItem) => void;
  onCancel: (item: BudgetItem) => void;
  onRestore: (item: BudgetItem) => void;
  onIgnore: (item: BudgetItem) => void;
}) {
  const actions = getItemActions(item.status);

  if (actions.terminalReason) {
    return <p className="m-0 text-[11px] font-medium text-muted">{actions.terminalReason}</p>;
  }

  return (
    <div className={cn("flex justify-end gap-1.5", mobile && "grid grid-cols-2 gap-1.5")} role="group" aria-label={`Acciones para la partida ${item.name}`}>
      {actions.canEdit ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 border px-2 text-[11px] font-semibold border-blue-400/60 bg-blue-500/15 text-blue-700 hover:border-blue-500/70 hover:bg-blue-500/25 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-300"
          onClick={() => onEdit(item)}
          aria-label={`Editar la partida ${item.name}`}
        >
          <span>Editar</span>
        </Button>
      ) : null}

      {item.status === "pending" ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 border px-2 text-[11px] font-semibold border-[var(--color-warning)]/50 bg-[var(--color-warning)]/15 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/25"
          loading={busy}
          loadingText="Guardando..."
          disabled={!actions.canChangeStatus}
          onClick={() => onIgnore(item)}
          aria-label={`Ignorar la partida ${item.name}`}
        >
          <span>Ignorar</span>
        </Button>
      ) : null}

      {item.status === "ignored" ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 border px-2 text-[11px] font-semibold border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:border-emerald-300/70 hover:bg-emerald-500/25"
          loading={busy}
          loadingText="Guardando..."
          disabled={!actions.canChangeStatus}
          onClick={() => onRestore(item)}
          aria-label={`Devolver a pendiente la partida ${item.name}`}
        >
          <span>Reactivar</span>
        </Button>
      ) : null}

      {actions.canCancel ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 border px-2 text-[11px] font-semibold border-[var(--color-danger)]/50 bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:border-[var(--color-danger)]/70 hover:bg-[var(--color-danger)]/25"
          loading={busy}
          loadingText="Cancelando..."
          onClick={() => onCancel(item)}
          aria-label={`Cancelar la partida ${item.name}`}
        >
          <span>Cancelar</span>
        </Button>
      ) : null}
    </div>
  );
}
