import { Button } from "@/components/ui/button";
import type { ActiveFilterValue, FilterChip, FilterSlot } from "./catalog-section-types";

type Props = {
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  activeFilter: ActiveFilterValue;
  onActiveFilterChange: (value: ActiveFilterValue) => void;
  extraFilters?: FilterSlot[];
  chips?: FilterChip[];
  onClearFilters: () => void;
};

export function SectionFilterBar({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  activeFilter,
  onActiveFilterChange,
  extraFilters,
  chips,
  onClearFilters
}: Props) {
  const hasActiveFilters = Boolean(searchValue.trim()) || activeFilter !== "all" || Boolean(chips?.length);

  return (
    <div className="space-y-2 border border-zinc-800 bg-zinc-950 p-2.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-300">Filtros</p>
      <div className="grid gap-2 lg:grid-cols-[minmax(220px,2fr)_minmax(140px,1fr)]">
        <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Buscar
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-8 rounded-none border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-100 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600"
            placeholder={searchPlaceholder}
          />
        </label>

        <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Estado
          <select
            value={activeFilter}
            onChange={(event) => onActiveFilterChange(event.target.value as ActiveFilterValue)}
            className="h-8 rounded-none border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </label>

        {extraFilters?.map((filter) => (
          <label key={filter.label} className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            {filter.label}
            {filter.content}
          </label>
        ))}
      </div>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {searchValue.trim() ? (
            <button
              type="button"
              className="rounded-none border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-200"
              onClick={() => onSearchChange("")}
            >
              Búsqueda: {searchValue.trim()} ×
            </button>
          ) : null}

          {activeFilter !== "all" ? (
            <button
              type="button"
              className="rounded-none border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-200"
              onClick={() => onActiveFilterChange("all")}
            >
              Estado: {activeFilter === "active" ? "Activos" : "Inactivos"} ×
            </button>
          ) : null}

          {chips?.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="rounded-none border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-200"
              onClick={chip.onClear}
            >
              {chip.label} ×
            </button>
          ))}

          <Button
            type="button"
            variant="secondary"
            className="h-8 rounded-none border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800"
            onClick={onClearFilters}
          >
            Limpiar filtros
          </Button>
        </div>
      ) : null}
    </div>
  );
}
