"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { formatCurrency } from "@/lib/format/currency";
import { cn } from "@/lib/ui/cn";
import {
  budgetStatusBadgeClass,
  budgetStatusLabel,
  describeBudgetScope,
  formatPercent,
  type BudgetCatalogIndex
} from "../_lib/budgets-ui";
import type { BudgetRow } from "../_hooks/use-budgets-admin";
import { BudgetActionsMenu } from "./budget-actions-menu";
import { BudgetProgress } from "./budget-progress";
import { BudgetThresholdChips } from "./budget-threshold-chips";

type Props = {
  rows: BudgetRow[];
  loading: boolean;
  errorMessage?: string | null;
  catalogs: BudgetCatalogIndex;
  onEdit: (row: BudgetRow) => void;
  onToggleActive: (row: BudgetRow) => void;
};

export function BudgetsTable({ rows, loading, errorMessage, catalogs, onEdit, onToggleActive }: Props) {
  const columns = useMemo<ColumnDef<BudgetRow>[]>(
    () => [
      {
        id: "name",
        header: "Presupuesto",
        accessorFn: (row) => row.status.name,
        cell: ({ row }) => {
          const scope = describeBudgetScope(row.original.status, catalogs);
          return (
            <div className="min-w-0">
              <p className="m-0 text-xs font-bold text-primary">{row.original.status.name}</p>
              <p className="m-0 text-[11px] text-muted">
                {scope.label}
                {scope.hint ? ` · ${scope.hint}` : ""}
              </p>
            </div>
          );
        }
      },
      {
        id: "amount",
        header: "Límite",
        accessorFn: (row) => row.status.amountMxn,
        cell: ({ row }) => <span className="tabular-nums font-semibold">{formatCurrency(row.original.status.amountMxn)}</span>
      },
      {
        id: "spent",
        header: "Gastado",
        accessorFn: (row) => row.status.spent,
        cell: ({ row }) => <span className="tabular-nums font-semibold">{formatCurrency(row.original.status.spent)}</span>
      },
      {
        id: "remaining",
        header: "Restante",
        accessorFn: (row) => row.status.remaining,
        cell: ({ row }) => (
          <span className={cn("tabular-nums font-semibold", row.original.status.remaining < 0 && "text-[var(--color-danger)]")}>
            {formatCurrency(row.original.status.remaining)}
          </span>
        )
      },
      {
        id: "progress",
        header: "Avance",
        accessorFn: (row) => row.status.percentUsed,
        cell: ({ row }) => (
          <div className="w-40 space-y-1.5">
            <p className="m-0 text-[11px] font-bold tabular-nums text-secondary">{formatPercent(row.original.status.percentUsed)}</p>
            <BudgetProgress percentUsed={row.original.status.percentUsed} status={row.original.status.status} />
          </div>
        )
      },
      {
        id: "status",
        header: "Estado",
        accessorFn: (row) => row.status.status,
        cell: ({ row }) => {
          const reached = row.original.status.reachedThreshold;
          return (
            <div className="flex flex-col items-start gap-1">
              <span className={budgetStatusBadgeClass(row.original.status.status)}>{budgetStatusLabel(row.original.status.status)}</span>
              {reached ? (
                <span className="text-[11px] font-medium text-muted">
                  Umbral: {reached.name} ({formatPercent(reached.percent)})
                </span>
              ) : null}
            </div>
          );
        }
      },
      {
        id: "thresholds",
        header: "Umbrales",
        enableSorting: false,
        cell: ({ row }) => (
          <BudgetThresholdChips
            thresholds={row.original.thresholds}
            reachedThresholdId={row.original.status.reachedThreshold?.thresholdId ?? null}
            status={row.original.status.status}
          />
        )
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <BudgetActionsMenu status={row.original.status} onEdit={() => onEdit(row.original)} onToggleActive={() => onToggleActive(row.original)} />
        )
      }
    ],
    [catalogs, onEdit, onToggleActive]
  );

  return (
    <div className="app-grid-skin app-grid-skin-flat overflow-hidden rounded-none p-0">
      <DataGrid
        columns={columns}
        rows={rows}
        loading={loading}
        errorMessage={errorMessage}
        mode="client"
        density="compact"
        emptyMessage="Sin presupuestos para el periodo"
        stickyHeader
        stickyActionsColumn
        initialSorting={[{ id: "name", desc: false }]}
      />
    </div>
  );
}
