import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import type { AdminUser } from "@/lib/contracts/users-admin";
import { Pencil, Power, Trash2 } from "lucide-react";

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
          return (
            <div className="flex gap-1">
              <Button
                type="button"
                variant="secondary"
                className="h-7 rounded-lg border border-slate-300 bg-slate-100 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                onClick={() => onEdit(item)}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Editar</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={item.active
                  ? "h-7 rounded-lg border border-amber-300 bg-amber-50 px-2 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
                  : "h-7 rounded-lg border border-emerald-300 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                }
                onClick={() => onToggleActive(item)}
              >
                <Power className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{item.active ? "Desactivar" : "Activar"}</span>
              </Button>
              <Button
                type="button"
                variant="danger"
                className="h-7 rounded-lg border border-rose-400 bg-rose-500 px-2 text-[11px] font-semibold text-white hover:bg-rose-600 dark:border-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
                onClick={() => onDelete(item)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Borrar</span>
              </Button>
            </div>
          );
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
