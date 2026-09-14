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
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-none border border-strong bg-[var(--color-surface-3)] text-primary">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-primary text-xs font-bold uppercase tracking-wide">{title ?? "Buscar y filtrar"}</p>
            {subtitle ? <p className="text-muted text-[11px] font-medium">{subtitle}</p> : null}
          </div>
        </div>

        {hasActiveFilters && !hideFeedback ? (
          <Button
            type="button"
            variant="ghost"
            className="btn-secondary-semantic h-8 px-2.5 text-[11px] font-bold"
            onClick={onClearFilters}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 p-2 lg:grid-cols-[minmax(220px,2fr)_minmax(140px,1fr)_minmax(160px,1fr)_auto] lg:items-end">
        <label className="text-muted grid gap-1 text-[10px] font-semibold uppercase tracking-wide">
          Buscar
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            className="input-semantic h-8 rounded-none px-2.5 text-xs"
            placeholder={searchPlaceholder}
          />
        </label>

        <label className="text-muted grid gap-1 text-[10px] font-semibold uppercase tracking-wide">
          Estado
          <select
            value={activeFilter}
            onChange={(event) => onActiveFilterChange(event.target.value as ActiveFilterValue)}
            className="input-semantic h-8 rounded-none px-2 text-xs"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </label>

        {extraFilters?.map((filter) => (
          <label key={filter.label} className="text-muted grid gap-1 text-[10px] font-semibold uppercase tracking-wide">
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
              className="border-strong rounded-none border bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-secondary"
              onClick={() => onSearchChange("")}
            >
              Búsqueda: {searchValue.trim()} ×
            </button>
          ) : null}

          {activeFilter !== "all" ? (
            <button
              type="button"
              className="border-strong rounded-none border bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-secondary"
              onClick={() => onActiveFilterChange("all")}
            >
              Estado: {activeFilter === "active" ? "Activos" : "Inactivos"} ×
            </button>
          ) : null}

          {chips?.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="border-strong rounded-none border bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-secondary"
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
