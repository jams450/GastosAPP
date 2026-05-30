"use client";

import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/ui/cn";

export type DataGridMode = "client" | "server";
export type DataGridDensity = "compact" | "normal";

type DataGridProps<TData> = {
  columns: ColumnDef<TData>[];
  rows: TData[];
  mode?: DataGridMode;
  density?: DataGridDensity;
  allowDensityToggle?: boolean;
  densityStorageKey?: string;
  loading?: boolean;
  emptyMessage?: string;
  errorMessage?: string | null;
  manualSorting?: boolean;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  manualPagination?: boolean;
  pagination?: PaginationState;
  onPaginationChange?: (pagination: PaginationState) => void;
  rowCount?: number;
  initialSorting?: SortingState;
  pageSizeOptions?: number[];
  toolbar?: ReactNode;
  stickyHeader?: boolean;
  stickyActionsColumn?: boolean;
};

export function DataGrid<TData>({
  columns,
  rows,
  mode = "client",
  density,
  allowDensityToggle = false,
  densityStorageKey,
  loading = false,
  emptyMessage = "Sin resultados",
  errorMessage,
  manualSorting,
  sorting,
  onSortingChange,
  manualPagination,
  pagination,
  onPaginationChange,
  rowCount,
  initialSorting,
  pageSizeOptions = [10, 25, 50],
  toolbar,
  stickyHeader = true,
  stickyActionsColumn = true
}: DataGridProps<TData>) {
  const resolvedManualSorting = manualSorting ?? mode === "server";
  const resolvedManualPagination = manualPagination ?? mode === "server";

  const [internalSorting, setInternalSorting] = useState<SortingState>(initialSorting ?? []);
  const [internalPagination, setInternalPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [internalDensity, setInternalDensity] = useState<DataGridDensity>(density ?? "compact");

  useEffect(() => {
    if (!densityStorageKey || density) {
      return;
    }

    const persistedDensity = window.localStorage.getItem(densityStorageKey);
    if (persistedDensity === "compact" || persistedDensity === "normal") {
      setInternalDensity(persistedDensity);
    }
  }, [density, densityStorageKey]);

  const effectiveSorting = sorting ?? internalSorting;
  const effectivePagination = pagination ?? internalPagination;
  const effectiveDensity = density ?? internalDensity;

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting: effectiveSorting,
      pagination: effectivePagination
    },
    manualSorting: resolvedManualSorting,
    manualPagination: resolvedManualPagination,
    rowCount,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(effectiveSorting) : updater;
      if (onSortingChange) {
        onSortingChange(next);
      } else {
        setInternalSorting(next);
      }
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(effectivePagination) : updater;
      if (onPaginationChange) {
        onPaginationChange(next);
      } else {
        setInternalPagination(next);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: resolvedManualSorting ? undefined : getSortedRowModel(),
    getPaginationRowModel: resolvedManualPagination ? undefined : getPaginationRowModel()
  });

  const headerCellClass = cn(
    "text-left font-medium text-muted",
    effectiveDensity === "compact" ? "px-2 py-2 text-[11px]" : "px-3 py-2.5 text-sm"
  );

  const bodyCellClass = cn(
    "text-primary",
    effectiveDensity === "compact" ? "px-2 py-2 text-xs" : "px-3 py-2.5 text-sm"
  );

  function handleDensityChange(nextDensity: DataGridDensity) {
    setInternalDensity(nextDensity);
    if (densityStorageKey) {
      window.localStorage.setItem(densityStorageKey, nextDensity);
    }
  }

  return (
      <div className="space-y-2">
      {allowDensityToggle && !density ? (
          <div className="flex items-center justify-end">
            <div className="inline-flex items-center gap-1 border border-strong bg-[var(--color-surface-2)] p-0.5">
            <button
              type="button"
              className={cn(
                "px-2 py-1 text-[11px] font-medium transition",
                effectiveDensity === "compact"
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                  : "text-muted hover:bg-[var(--color-accent-soft)] hover:text-primary"
              )}
              onClick={() => handleDensityChange("compact")}
            >
              Compacta
            </button>
            <button
              type="button"
              className={cn(
                "px-2 py-1 text-[11px] font-medium transition",
                effectiveDensity === "normal"
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                  : "text-muted hover:bg-[var(--color-accent-soft)] hover:text-primary"
              )}
              onClick={() => handleDensityChange("normal")}
            >
              Cómoda
            </button>
          </div>
        </div>
      ) : null}

      {toolbar ? <div className="min-w-0">{toolbar}</div> : null}

      <div className="table-shell overflow-x-auto">
        <table className="min-w-full">
          <thead className="table-head">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortState = header.column.getIsSorted();
                  const sortIndicator = sortState === "asc" ? "▲" : sortState === "desc" ? "▼" : "";
                  const isActionsColumn = header.column.id === "actions";
                  const stickyColumnClass =
                    stickyActionsColumn && isActionsColumn
                      ? "sticky right-0 z-10 bg-[var(--color-surface-3)]"
                      : undefined;
                  const stickyHeaderClass = stickyHeader ? "sticky top-0 z-20" : undefined;
                  const sortIndex = header.column.getSortIndex();
                  const showSortOrder = sortState && table.getState().sorting.length > 1;

                  return (
                    <th key={header.id} className={cn(headerCellClass, stickyHeaderClass, stickyColumnClass)}>
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1",
                            canSort ? "cursor-pointer select-none" : "cursor-default"
                          )}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="text-[10px] text-muted">{sortIndicator}</span>
                          {showSortOrder ? <span className="text-[10px] text-muted">{sortIndex + 1}</span> : null}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {errorMessage ? (
              <tr>
                <td className={cn(bodyCellClass, "text-[var(--color-danger)]")} colSpan={columns.length}>
                  {errorMessage}
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td className={bodyCellClass} colSpan={columns.length}>
                  Cargando...
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td className={bodyCellClass} colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="table-row transition">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        bodyCellClass,
                        "table-cell",
                        stickyActionsColumn && cell.column.id === "actions" ? "sticky right-0 z-10 bg-[var(--color-surface-2)]" : undefined
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!resolvedManualPagination && table.getPageCount() > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border border-strong border-t-0 bg-[var(--color-surface-2)] px-2 py-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">Filas</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(event) => table.setPageSize(Number(event.target.value))}
              className="input-semantic h-7 px-2 text-[11px]"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="btn-secondary-semantic h-7 px-2 text-[11px] disabled:opacity-50"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </button>
          <span className="text-[11px] text-muted">
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
          </span>
            <button
              type="button"
              className="btn-secondary-semantic h-7 px-2 text-[11px] disabled:opacity-50"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
            Siguiente
          </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
