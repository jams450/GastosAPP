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
import { useState } from "react";
import { cn } from "@/lib/ui/cn";

export type DataGridMode = "client" | "server";
export type DataGridDensity = "compact" | "normal";

type DataGridProps<TData> = {
  columns: ColumnDef<TData>[];
  rows: TData[];
  mode?: DataGridMode;
  density?: DataGridDensity;
  loading?: boolean;
  emptyMessage?: string;
  manualSorting?: boolean;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  manualPagination?: boolean;
  pagination?: PaginationState;
  onPaginationChange?: (pagination: PaginationState) => void;
  rowCount?: number;
};

export function DataGrid<TData>({
  columns,
  rows,
  mode = "client",
  density = "compact",
  loading = false,
  emptyMessage = "Sin resultados",
  manualSorting,
  sorting,
  onSortingChange,
  manualPagination,
  pagination,
  onPaginationChange,
  rowCount
}: DataGridProps<TData>) {
  const resolvedManualSorting = manualSorting ?? mode === "server";
  const resolvedManualPagination = manualPagination ?? mode === "server";

  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalPagination, setInternalPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  const effectiveSorting = sorting ?? internalSorting;
  const effectivePagination = pagination ?? internalPagination;

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
    density === "compact" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"
  );

  const bodyCellClass = cn(
    "text-slate-800 dark:text-slate-200",
    density === "compact" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full">
          <thead className="bg-slate-50 dark:bg-slate-900/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortState = header.column.getIsSorted();
                  const sortIndicator = sortState === "asc" ? "▲" : sortState === "desc" ? "▼" : "";

                  return (
                    <th key={header.id} className={headerCellClass}>
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
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
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
                <tr key={row.id} className="border-t border-slate-200 dark:border-slate-800">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={bodyCellClass}>
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
        <div className="flex items-center justify-end gap-2">
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
      ) : null}
    </div>
  );
}
