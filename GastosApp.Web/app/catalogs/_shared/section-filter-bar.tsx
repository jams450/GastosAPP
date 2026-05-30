import { Button } from "@/components/ui/button";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import type { ActiveFilterValue, FilterChip, FilterSlot } from "./catalog-section-types";

type Props = {
  title?: string;
  subtitle?: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  activeFilter: ActiveFilterValue;
  onActiveFilterChange: (value: ActiveFilterValue) => void;
  extraFilters?: FilterSlot[];
  chips?: FilterChip[];
  onClearFilters: () => void;
  actions?: ReactNode;
  hideChips?: boolean;
  hideFeedback?: boolean;
};

export function SectionFilterBar({
  title,
  subtitle,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  activeFilter,
  onActiveFilterChange,
  extraFilters,
  chips,
  onClearFilters,
  actions,
  hideChips = false,
  hideFeedback = false
}: Props) {
  const hasActiveFilters = Boolean(searchValue.trim()) || activeFilter !== "all" || Boolean(chips?.length);

  return (
    <div className="space-y-2 p-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-none bg-zinc-800 text-zinc-200">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-200">{title ?? "Buscar y filtrar"}</p>
            {subtitle ? <p className="text-[11px] font-medium text-zinc-400">{subtitle}</p> : null}
          </div>
        </div>

        {hasActiveFilters && !hideFeedback ? (
          <Button
            type="button"
            variant="ghost"
            className="h-8 border border-zinc-700 bg-zinc-900 px-2.5 text-[11px] font-bold text-zinc-200 hover:bg-zinc-800"
            onClick={onClearFilters}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 p-2 lg:grid-cols-[minmax(220px,2fr)_minmax(140px,1fr)_minmax(160px,1fr)_auto] lg:items-end">
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

        {actions ? <div className="flex items-end justify-end">{actions}</div> : null}
      </div>

      {hasActiveFilters && !hideChips && !hideFeedback ? (
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

        </div>
      ) : null}
    </div>
  );
}
