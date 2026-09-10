import type { DashboardViewMode } from "@/app/dashboard/_components/dashboard-view-mode";
import { dashboardViewModeLabel } from "@/app/dashboard/_components/dashboard-view-mode";
import { CalendarDays, LayoutGrid, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/ui/cn";

type DashboardToolbarProps = {
  month: string;
  timezone: string;
  viewMode: DashboardViewMode;
  onMonthChange: (value: string) => void;
  onViewModeChange: (mode: DashboardViewMode) => void;
};

const viewModes: DashboardViewMode[] = ["detail", "headers", "grid2", "grid3"];

export function DashboardToolbar({
  month,
  timezone,
  viewMode,
  onMonthChange,
  onViewModeChange
}: DashboardToolbarProps) {
  return (
    <section className="app-panel overflow-hidden p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Control del dashboard
          </div>
          <h2 className="m-0 text-xl font-semibold tracking-tight text-primary">Tu resumen financiero</h2>
          <p className="m-0 text-sm text-muted">Consulta ingresos, gastos, saldos y deuda sin perder el contexto del periodo.</p>
          <p className="m-0 text-xs text-muted">Zona horaria: {timezone}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end lg:justify-end">
          <div className="grid gap-1">
             <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="dashboard-month">
               <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
               Mes
             </label>
             <input
              id="dashboard-month"
              type="month"
              value={month}
              onChange={(event) => onMonthChange(event.target.value)}
               className="input-semantic h-10 min-w-44 px-3 text-sm focus-ring"
            />
          </div>

          <div className="grid gap-1">
             <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
               <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
               Visualización
             </span>
             <div className="grid min-h-10 grid-cols-2 rounded-[var(--radius-sm)] border border-default bg-[var(--color-surface-1)] p-1 sm:inline-flex sm:grid-cols-none">
              {viewModes.map((mode) => {
                const isActive = mode === viewMode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onViewModeChange(mode)}
                    className={cn(
                       "min-h-8 rounded-md px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]",
                      isActive
                         ? "bg-[var(--color-accent-soft)] text-primary"
                         : "text-muted hover:bg-[var(--color-surface-3)] hover:text-primary"
                    )}
                    aria-pressed={isActive}
                  >
                    {dashboardViewModeLabel[mode]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
