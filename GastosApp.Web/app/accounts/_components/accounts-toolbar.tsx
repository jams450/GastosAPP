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
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-none border border-strong bg-[var(--color-surface-3)] text-primary">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-primary text-xs font-bold uppercase tracking-wide">Filtros</p>
            <p className="text-muted text-[11px] font-medium">
              Mostrando <span className="text-primary font-semibold">{filtered}</span> de <span className="text-primary font-semibold">{total}</span> registros
            </p>
          </div>
        </div>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            className="btn-secondary-semantic h-8 px-2.5 text-[11px] font-bold"
            onClick={onResetFilters}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 p-2 lg:grid-cols-[1fr_150px_150px_auto] lg:items-end">
        <label className="text-secondary grid gap-1 text-xs font-medium uppercase tracking-wide">
          <span>Buscar</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Nombre de cuenta"
              className="input-semantic h-8 rounded-none pl-8 text-xs"
            />
          </div>
        </label>

        <label className="text-secondary grid gap-1 text-xs font-medium uppercase tracking-wide">
          <span>Estado</span>
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as "all" | "active" | "inactive")}
            className="input-semantic h-8 rounded-none px-2 text-xs font-semibold"
          >
            <option value="all">Todas</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </label>

        <label className="text-secondary grid gap-1 text-xs font-medium uppercase tracking-wide">
          <span>Tipo</span>
          <select
            value={type}
            onChange={(event) => onTypeChange(event.target.value as "all" | "credit" | "cash")}
            className="input-semantic h-8 rounded-none px-2 text-xs font-semibold"
          >
            <option value="all">Todos</option>
            <option value="credit">Crédito</option>
            <option value="cash">Efectivo</option>
          </select>
        </label>

        <div className="flex items-end justify-end">
          <Button
            type="button"
            variant="primary"
            className="h-8 rounded-md px-3 text-xs font-bold"
            onClick={onCreate}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Nueva cuenta
          </Button>
        </div>
      </div>
    </section>
  );
}
