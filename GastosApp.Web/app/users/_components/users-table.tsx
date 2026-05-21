import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "@/components/data-grid/data-grid";
import type { AdminUser } from "@/lib/contracts/users-admin";
import { UserActionsMenu } from "./user-actions-menu";

type Props = {
  rows: AdminUser[];
  loading: boolean;
  onEdit: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
};

export function UsersTable({ rows, loading, onEdit, onToggleActive, onDelete }: Props) {
  const columns = useMemo<ColumnDef<AdminUser>[]>(
    () => [
      { accessorKey: "name", header: "Nombre" },
      { accessorKey: "email", header: "Correo" },
      {
        accessorKey: "admin",
        header: "Rol",
        cell: ({ row }) => (
          <span className={row.original.admin ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-300"}>
            {row.original.admin ? "Admin" : "Usuario"}
          </span>
        )
      },
      {
        accessorKey: "active",
        header: "Estado",
        cell: ({ row }) => (
          <span
            className={row.original.active
              ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"}
          >
            {row.original.active ? "Activo" : "Inactivo"}
          </span>
        )
      },
      {
        id: "actions",
        header: "Acciones",
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          return <UserActionsMenu user={item} onEdit={onEdit} onToggleActive={onToggleActive} onDelete={onDelete} />;
        }
      }
    ],
    [onDelete, onEdit, onToggleActive]
  );

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      mode="client"
      density="compact"
      loading={loading}
      emptyMessage="No hay usuarios"
    />
  );
}
