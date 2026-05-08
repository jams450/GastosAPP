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
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px_auto] lg:items-end">
        <Input
          label="Buscar"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Nombre o correo"
        />

        <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Estado
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as "all" | "active" | "inactive")}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Rol
          <select
            value={role}
            onChange={(event) => onRoleChange(event.target.value as "all" | "admin" | "user")}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="all">Todos</option>
            <option value="admin">Admins</option>
            <option value="user">Usuarios</option>
          </select>
        </label>

        <Button
          type="button"
          className="h-9 rounded-lg border border-sky-600 bg-sky-600 px-3 text-xs font-semibold text-white hover:border-sky-700 hover:bg-sky-700"
          onClick={onCreate}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Nuevo</span>
        </Button>
      </div>
    </section>
  );
}
