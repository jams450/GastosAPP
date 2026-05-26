import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Filter, Plus, RotateCcw, Search, SlidersHorizontal } from "lucide-react";

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-200">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold text-zinc-100">Panel de filtros</p>
            <p className="text-xs font-medium text-zinc-400">
              Mostrando <span className="font-semibold text-zinc-100">{filtered}</span> de <span className="font-semibold text-zinc-100">{total}</span> usuarios
            </p>
          </div>
        </div>
        {hasActiveFilters ? (
          <Button type="button" variant="ghost" className="h-9 border border-zinc-700 bg-zinc-900 px-3 text-xs font-bold text-zinc-200 hover:bg-zinc-800" onClick={onResetFilters}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Limpiar
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 lg:grid-cols-[1fr_170px_170px_auto] lg:items-end">
        <Input
          label="Buscar"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Nombre o correo"
          rightSlot={<Search className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />}
        />

        <label className="grid gap-1.5 text-sm font-medium text-[var(--tabler-text)]">
          Estado
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as "all" | "active" | "inactive")}
            className="h-10 rounded-[var(--tabler-radius-sm)] border bg-[var(--tabler-surface-1)] px-3 text-sm"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-[var(--tabler-text)]">
          Rol
          <select
            value={role}
            onChange={(event) => onRoleChange(event.target.value as "all" | "admin" | "user")}
            className="h-10 rounded-[var(--tabler-radius-sm)] border bg-[var(--tabler-surface-1)] px-3 text-sm"
          >
            <option value="all">Todos</option>
            <option value="admin">Admin</option>
            <option value="user">Usuario</option>
          </select>
        </label>

        <Button
          type="button"
          variant="secondary"
          className="h-11 border-zinc-700 bg-zinc-800 px-5 text-sm font-extrabold text-zinc-100 hover:bg-zinc-700"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo usuario
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-300">
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          Filtros {hasActiveFilters ? "activos" : "inactivos"}
        </span>
      </div>
    </section>
  );
}
