import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, RotateCcw, Search, SlidersHorizontal } from "lucide-react";

type Props = {
  total: number;
  filtered: number;
  search: string;
  status: "all" | "active" | "inactive";
  role: "all" | "admin" | "user";
  hasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: "all" | "active" | "inactive") => void;
  onRoleChange: (value: "all" | "admin" | "user") => void;
  onResetFilters: () => void;
  onCreate: () => void;
};

export function UsersToolbar({
  total,
  filtered,
  search,
  status,
  role,
  hasActiveFilters,
  onSearchChange,
  onStatusChange,
  onRoleChange,
  onResetFilters,
  onCreate
}: Props) {
  return (
    <section className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-none bg-zinc-800 text-zinc-200">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-200">Filtros</p>
            <p className="text-[11px] font-medium text-zinc-400">
              Mostrando <span className="font-semibold text-zinc-100">{filtered}</span> de <span className="font-semibold text-zinc-100">{total}</span> usuarios
            </p>
          </div>
        </div>
        {hasActiveFilters ? (
          <Button type="button" variant="ghost" className="h-8 border border-zinc-700 bg-zinc-900 px-2.5 text-[11px] font-bold text-zinc-200 hover:bg-zinc-800" onClick={onResetFilters}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Limpiar (filtros activos)
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 p-2 lg:grid-cols-[1fr_150px_150px_auto] lg:items-end">
        <Input
          label="Buscar"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Nombre o correo"
          rightSlot={<Search className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />}
        />

        <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-zinc-300">
          Estado
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as "all" | "active" | "inactive")}
            className="h-8 rounded-none border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-semibold text-zinc-100 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          >
            <option value="all" className="bg-zinc-900 text-zinc-100">Todos</option>
            <option value="active" className="bg-zinc-900 text-zinc-100">Activos</option>
            <option value="inactive" className="bg-zinc-900 text-zinc-100">Inactivos</option>
          </select>
        </label>

        <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-zinc-300">
          Rol
          <select
            value={role}
            onChange={(event) => onRoleChange(event.target.value as "all" | "admin" | "user")}
            className="h-8 rounded-none border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-semibold text-zinc-100 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          >
            <option value="all" className="bg-zinc-900 text-zinc-100">Todos</option>
            <option value="admin" className="bg-zinc-900 text-zinc-100">Admin</option>
            <option value="user" className="bg-zinc-900 text-zinc-100">Usuario</option>
          </select>
        </label>

        <Button
          type="button"
          variant="primary"
          className="h-8 !border-[#0F3158] !bg-[#0F3158] px-3 text-xs font-bold text-white hover:!border-[#144277] hover:!bg-[#144277]"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo usuario
        </Button>
      </div>
    </section>
  );
}
