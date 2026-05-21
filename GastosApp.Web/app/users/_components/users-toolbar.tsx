import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

type Props = {
  search: string;
  status: "all" | "active" | "inactive";
  role: "all" | "admin" | "user";
  onSearchChange: (value: string) => void;
  onStatusChange: (value: "all" | "active" | "inactive") => void;
  onRoleChange: (value: "all" | "admin" | "user") => void;
  onCreate: () => void;
};

export function UsersToolbar({ search, status, role, onSearchChange, onStatusChange, onRoleChange, onCreate }: Props) {
  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <Input
            label="Buscar"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Nombre o correo"
            className="bg-slate-50/80 dark:bg-slate-900"
          />

          <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
            Estado
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value as "all" | "active" | "inactive")}
              className="h-11 rounded-xl border border-slate-300 bg-slate-50/80 px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 sm:col-span-2 lg:col-span-1">
            Rol
            <select
              value={role}
              onChange={(event) => onRoleChange(event.target.value as "all" | "admin" | "user")}
              className="h-11 rounded-xl border border-slate-300 bg-slate-50/80 px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">Todos</option>
              <option value="admin">Admins</option>
              <option value="user">Usuarios</option>
            </select>
          </label>
        </div>

        <Button
          type="button"
          className="h-11 rounded-xl border border-sky-600 bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm hover:border-sky-700 hover:bg-sky-700 lg:mb-px"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Nuevo usuario</span>
        </Button>
      </div>
    </section>
  );
}
