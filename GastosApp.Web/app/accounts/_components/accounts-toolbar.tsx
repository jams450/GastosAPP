import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, RotateCcw, Search, SlidersHorizontal } from "lucide-react";

type Props = {
  total: number;
  filtered: number;
  search: string;
  status: "all" | "active" | "inactive";
  type: "all" | "credit" | "cash";
  hasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: "all" | "active" | "inactive") => void;
  onTypeChange: (value: "all" | "credit" | "cash") => void;
  onResetFilters: () => void;
  onCreate: () => void;
};

export function AccountsToolbar({
  total,
  filtered,
  search,
  status,
  type,
  hasActiveFilters,
  onSearchChange,
  onStatusChange,
  onTypeChange,
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
              Mostrando <span className="font-semibold text-zinc-100">{filtered}</span> de <span className="font-semibold text-zinc-100">{total}</span> cuentas
            </p>
          </div>
        </div>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            className="h-8 border border-zinc-700 bg-zinc-900 px-2.5 text-[11px] font-bold text-zinc-200 hover:bg-zinc-800"
            onClick={onResetFilters}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto]">
        <label className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Buscar</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <Input
              label="Buscar"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Nombre de cuenta"
              className="h-9 rounded-none border-zinc-700 bg-zinc-900 pl-8 text-xs text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Estado</span>
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as "all" | "active" | "inactive")}
            className="h-9 rounded-none border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-100 outline-none focus:border-zinc-500"
          >
            <option value="all">Todas</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Tipo</span>
          <select
            value={type}
            onChange={(event) => onTypeChange(event.target.value as "all" | "credit" | "cash")}
            className="h-9 rounded-none border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-100 outline-none focus:border-zinc-500"
          >
            <option value="all">Todos</option>
            <option value="credit">Crédito</option>
            <option value="cash">Efectivo</option>
          </select>
        </label>

        <div className="flex items-end justify-end">
          <Button type="button" className="h-9 rounded-none px-3 text-xs font-bold" onClick={onCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Nueva cuenta
          </Button>
        </div>
      </div>
    </section>
  );
}
