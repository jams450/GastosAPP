import type { DashboardViewMode } from "@/app/dashboard/_components/dashboard-view-mode";
import { dashboardViewModeLabel } from "@/app/dashboard/_components/dashboard-view-mode";
import { cn } from "@/lib/ui/cn";

type DashboardToolbarProps = {
  month: string;
  timezone: string;
  viewMode: DashboardViewMode;
  onMonthChange: (value: string) => void;
  onViewModeChange: (mode: DashboardViewMode) => void;
};

const viewModes: DashboardViewMode[] = ["detail", "grid2", "grid3"];

export function DashboardToolbar({
  month,
  timezone,
  viewMode,
  onMonthChange,
  onViewModeChange
}: DashboardToolbarProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-1">
          <h2 className="m-0 text-lg font-semibold text-slate-900 dark:text-slate-100">Filtro del dashboard</h2>
          <p className="m-0 text-xs text-slate-500 dark:text-slate-400">Corte por zona horaria: {timezone}</p>
        </div>

        <div className="flex flex-wrap items-end justify-start gap-4 lg:justify-end">
          <div className="grid gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" htmlFor="dashboard-month">
              Mes
            </label>
            <input
              id="dashboard-month"
              type="month"
              value={month}
              onChange={(event) => onMonthChange(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-900"
            />
          </div>

          <div className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Visualización</span>
            <div className="inline-flex rounded-lg border border-slate-200 p-1 dark:border-slate-700">
              {viewModes.map((mode) => {
                const isActive = mode === viewMode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onViewModeChange(mode)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                      isActive
                        ? "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
