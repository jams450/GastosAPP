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
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-900/30">
      <div className="grid gap-2 lg:grid-cols-[minmax(220px,2fr)_minmax(140px,1fr)]">
        <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Buscar
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            placeholder={searchPlaceholder}
          />
        </label>

        <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Estado
          <select
            value={activeFilter}
            onChange={(event) => onActiveFilterChange(event.target.value as ActiveFilterValue)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </label>

        {extraFilters?.map((filter) => (
          <label key={filter.label} className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
              className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              onClick={() => onSearchChange("")}
            >
              Búsqueda: {searchValue.trim()} ×
            </button>
          ) : null}

          {activeFilter !== "all" ? (
            <button
              type="button"
              className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              onClick={() => onActiveFilterChange("all")}
            >
              Estado: {activeFilter === "active" ? "Activos" : "Inactivos"} ×
            </button>
          ) : null}

          {chips?.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              onClick={chip.onClear}
            >
              {chip.label} ×
            </button>
          ))}

          <Button type="button" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onClearFilters}>
            Limpiar filtros
          </Button>
        </div>
      ) : null}
    </div>
  );
}
