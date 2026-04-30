"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import type { Account } from "@/lib/contracts/accounts";
import { formatCurrency } from "@/lib/format/currency";

type Props = {
  rows: Account[];
  loading: boolean;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
};

export function AccountsTable({ rows, loading, onEdit, onToggleActive }: Props) {
  const columns = useMemo<ColumnDef<Account>[]>(
    () => [
      { header: "Cuenta", accessorKey: "name" },
      {
        header: "Tipo",
        cell: ({ row }) => (row.original.isCredit ? "Crédito" : "Efectivo")
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
        cell: ({ row }) => (
          <span className={row.original.active ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>
            {row.original.active ? "Activa" : "Inactiva"}
          </span>
        )
      },
      {
        id: "actions",
        header: "Acciones",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" className="h-8 px-2 text-xs" onClick={() => onEdit(row.original)}>
              Editar
            </Button>
            <Button type="button" variant={row.original.active ? "danger" : "secondary"} className="h-8 px-2 text-xs" onClick={() => onToggleActive(row.original)}>
              {row.original.active ? "Desactivar" : "Activar"}
            </Button>
          </div>
        )
      }
    ],
    [onEdit, onToggleActive]
  );

  return <DataGrid columns={columns} rows={rows} loading={loading} mode="client" density="compact" emptyMessage="Sin cuentas" />;
}
