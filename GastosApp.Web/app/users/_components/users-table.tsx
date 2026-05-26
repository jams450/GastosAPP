import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "@/components/data-grid/data-grid";
import type { AdminUser } from "@/lib/contracts/users-admin";
import { UserActionsMenu } from "./user-actions-menu";

type Props = {
  rows: AdminUser[];
  loading: boolean;
  errorMessage?: string | null;
  onEdit: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
};

export function UsersTable({ rows, loading, errorMessage, onEdit, onToggleActive, onDelete }: Props) {
  const columns = useMemo<ColumnDef<AdminUser>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{row.original.name}</p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">ID #{row.original.userId}</p>
          </div>
        )
      },
      { accessorKey: "email", header: "Correo" },
      {
        accessorKey: "admin",
        header: "Rol",
        cell: ({ row }) => <span className="tabler-badge tabler-badge-muted tabler-badge-solid">{row.original.admin ? "Admin" : "Usuario"}</span>
      },
      {
        accessorKey: "active",
        header: "Estado",
        cell: ({ row }) => (
          <span className={row.original.active ? "tabler-badge tabler-badge-success tabler-badge-solid" : "tabler-badge tabler-badge-danger tabler-badge-solid"}>{row.original.active ? "Activo" : "Inactivo"}</span>
        )
      },
      {
        id: "actions",
        header: "Acciones",
        enableSorting: false,
        cell: ({ row }) => <UserActionsMenu user={row.original} onEdit={onEdit} onToggleActive={onToggleActive} onDelete={onDelete} />
      }
    ],
    [onDelete, onEdit, onToggleActive]
  );

  return (
    <div className="users-desktop-table tabler-card overflow-hidden border-zinc-700/80 bg-zinc-950 p-0">
      <div className="border-b border-zinc-800 bg-zinc-900/90 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-400">Listado administrativo</p>
      </div>
      <DataGrid
        columns={columns}
        rows={rows}
        loading={loading}
        errorMessage={errorMessage}
        emptyMessage="No hay usuarios con filtros actuales"
        density="compact"
        stickyHeader
        stickyActionsColumn
      />
    </div>
  );
}
