"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "@/components/data-grid/data-grid";
import type { Account } from "@/lib/contracts/accounts";
import { formatCurrency } from "@/lib/format/currency";
import { accountAnnualSummaryHref } from "../_lib/accounts-annual-ui";
import { getAccountStatusBadgeClass, getAccountStatusLabel, getAccountTypeBadgeClass, getAccountTypeLabel } from "../_lib/accounts-ui";
import { AccountActionsMenu } from "./account-actions-menu";

type Props = {
  rows: Account[];
  loading: boolean;
  errorMessage?: string | null;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
};

export function AccountsTable({ rows, loading, errorMessage, onEdit, onToggleActive }: Props) {
  const columns = useMemo<ColumnDef<Account>[]>(
    () => [
      {
        header: "Cuenta",
        accessorKey: "name",
        // El nombre es el enlace al histórico anual; la celda conserva el acceso por la columna
        // para que el ordenamiento por nombre siga funcionando.
        cell: ({ row }) => (
          <Link
            href={accountAnnualSummaryHref(row.original.accountId)}
            className="focus-ring group inline-flex flex-col items-start gap-0.5"
            title={`Ver histórico anual de ${row.original.name}`}
          >
            <span className="text-primary font-semibold group-hover:underline">{row.original.name}</span>
            <span className="text-muted text-[11px] font-medium">Ver histórico</span>
          </Link>
        )
      },
      {
        header: "Tipo",
        cell: ({ row }) => <span className={getAccountTypeBadgeClass(row.original)}>{getAccountTypeLabel(row.original)}</span>
      },
      {
        header: "Saldo actual",
        cell: ({ row }) => formatCurrency(row.original.currentBalance)
      },
      {
        header: "Saldo inicial",
        cell: ({ row }) => formatCurrency(row.original.initialBalance)
      },
      {
        header: "Corte",
        cell: ({ row }) => (row.original.dueDay ? String(row.original.dueDay) : "—")
      },
      {
        header: "Pago límite",
        cell: ({ row }) => (row.original.paymentDueDay ? String(row.original.paymentDueDay) : "—")
      },
      {
        header: "Estado",
        cell: ({ row }) => <span className={getAccountStatusBadgeClass(row.original)}>{getAccountStatusLabel(row.original)}</span>
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => <AccountActionsMenu account={row.original} onEdit={onEdit} onToggleActive={onToggleActive} />
      }
    ],
    [onEdit, onToggleActive]
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
        emptyMessage="Sin cuentas con filtros actuales"
        stickyHeader
        stickyActionsColumn
      />
    </div>
  );
}
