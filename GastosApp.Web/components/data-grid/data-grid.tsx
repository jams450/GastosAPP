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
    "text-left font-medium text-slate-500 dark:text-slate-400",
    effectiveDensity === "compact" ? "px-2 py-2 text-[11px]" : "px-3 py-2.5 text-sm"
  );

  const bodyCellClass = cn(
    "text-slate-800 dark:text-slate-200",
    effectiveDensity === "compact" ? "px-2 py-2 text-xs" : "px-3 py-2.5 text-sm"
  );

  function handleDensityChange(nextDensity: DataGridDensity) {
    setInternalDensity(nextDensity);
    if (densityStorageKey) {
      window.localStorage.setItem(densityStorageKey, nextDensity);
    }
  }

  return (
    <div className="space-y-2.5">
      {allowDensityToggle && !density ? (
        <div className="flex items-center justify-end">
          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition",
                effectiveDensity === "compact"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
              onClick={() => handleDensityChange("compact")}
            >
              Compacta
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition",
                effectiveDensity === "normal"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
              onClick={() => handleDensityChange("normal")}
            >
              Cómoda
            </button>
          </div>
        </div>
      ) : null}

      {toolbar ? <div className="min-w-0">{toolbar}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <table className="min-w-full">
          <thead className="bg-slate-50/90 dark:bg-slate-900/80">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortState = header.column.getIsSorted();
                  const sortIndicator = sortState === "asc" ? "▲" : sortState === "desc" ? "▼" : "";
                  const isActionsColumn = header.column.id === "actions";
                  const stickyColumnClass =
                    stickyActionsColumn && isActionsColumn
                      ? "sticky right-0 z-10 bg-slate-50/90 dark:bg-slate-900/90"
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
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">{sortIndicator}</span>
                          {showSortOrder ? <span className="text-[10px] text-slate-400 dark:text-slate-500">{sortIndex + 1}</span> : null}
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
                <td className={cn(bodyCellClass, "text-rose-600 dark:text-rose-300")} colSpan={columns.length}>
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
                <tr key={row.id} className="border-t border-slate-200/80 transition hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-900/60">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        bodyCellClass,
                        stickyActionsColumn && cell.column.id === "actions" ? "sticky right-0 z-10 bg-white dark:bg-slate-950" : undefined
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Filas</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(event) => table.setPageSize(Number(event.target.value))}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Anterior
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
          </span>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
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
