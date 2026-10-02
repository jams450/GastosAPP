"use client";

import { BellRing, CalendarDays, ChevronLeft, ChevronRight, ListChecks, Plus, Sparkles, Wallet } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { tableActionStyles } from "@/lib/ui/table-action-styles";
import { nextPeriod, periodNavLabel, previousPeriod } from "../_lib/budget-period";
import type { BudgetsTab } from "../_lib/budgets-ui";

type Props = {
  period: string;
  tab: BudgetsTab;
  /** Etiqueta del botón de alta; `null` lo oculta cuando la pestaña no crea nada. */
  createLabel: string | null;
  onPeriodChange: (value: string) => void;
  /** Avanza o retrocede el periodo; los botones hacen `onPeriodChange(period ± 1 mes)`. */
  onPeriodStep: (months: number) => void;
  onTabChange: (tab: BudgetsTab) => void;
  onCreate: () => void;
};

const TABS: ReadonlyArray<{ id: BudgetsTab; label: string; icon: typeof Wallet }> = [
  { id: "resumen", label: "Límites del mes", icon: Wallet },
  { id: "partidas", label: "Partidas", icon: ListChecks },
  { id: "sugerencias", label: "Sugerencias", icon: Sparkles },
  { id: "alertas", label: "Alertas", icon: BellRing }
];

export function BudgetsToolbar({ period, tab, createLabel, onPeriodChange, onPeriodStep, onTabChange, onCreate }: Props) {
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const previous = previousPeriod(period);
  const next = nextPeriod(period);

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();
    const currentIndex = TABS.findIndex((item) => item.id === tab);
    const step = event.key === "ArrowRight" ? 1 : -1;
    // Navegación cíclica: la lista de pestañas no tiene extremos muertos.
    const next = TABS[(currentIndex + step + TABS.length) % TABS.length].id;
    onTabChange(next);
    window.requestAnimationFrame(() => {
      tabListRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
    });
  }

  return (
    <section className="app-panel p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="budgets-period">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Periodo
          </label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              className={`h-10 w-10 shrink-0 px-0 ${tableActionStyles.edit}`}
              disabled={previous === null}
              onClick={() => onPeriodStep(-1)}
              aria-label={previous ? periodNavLabel(previous, -1) : "Mes anterior"}
              title={previous ? periodNavLabel(previous, -1) : "Mes anterior"}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <input
              id="budgets-period"
              type="month"
              value={period}
              onChange={(event) => onPeriodChange(event.target.value)}
              className="input-semantic focus-ring h-10 min-w-44 px-3 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              className={`h-10 w-10 shrink-0 px-0 ${tableActionStyles.edit}`}
              disabled={next === null}
              onClick={() => onPeriodStep(1)}
              aria-label={next ? periodNavLabel(next, 1) : "Mes siguiente"}
              title={next ? periodNavLabel(next, 1) : "Mes siguiente"}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div
          ref={tabListRef}
          role="tablist"
          aria-label="Secciones de presupuestos"
          onKeyDown={onTabKeyDown}
          className="flex flex-wrap items-center gap-1 border border-default bg-[var(--color-surface-1)] p-1"
        >
          {TABS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                data-tab={item.id}
                id={`budgets-tab-${item.id}`}
                aria-selected={isActive}
                aria-controls={`budgets-panel-${item.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "focus-ring inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-bold transition",
                  isActive
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                    : "text-muted hover:bg-[var(--color-accent-soft)] hover:text-primary"
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>

        {createLabel ? (
          <Button
            type="button"
            variant="ghost"
            className={`h-8 rounded-none px-3 text-xs font-bold ${tableActionStyles.create}`}
            onClick={onCreate}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {createLabel}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
