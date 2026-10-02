"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toDateInputValue } from "@/lib/contracts/budget-items";
import type { RecurringItem } from "@/lib/contracts/recurring-items";
import { formatCurrency } from "@/lib/format/currency";
import { budgetItemKindBadgeClass, budgetItemKindLabel } from "../_lib/budget-items-model";
import { resolveTemplatePlannedDate } from "../_lib/budget-template-occurrence";

type Props = {
  templates: RecurringItem[];
  period: string;
  periodLabel: string;
  addingId: number | null;
  onAdd: (template: RecurringItem) => void;
};

function formatPlannedDay(dayOfMonth: number, period: string): string {
  const iso = resolveTemplatePlannedDate(dayOfMonth, period);
  const inputValue = toDateInputValue(iso);
  if (!iso || !inputValue) {
    return `Día ${dayOfMonth}`;
  }

  // Se formatea en UTC para no correr el día: la fecha viene sin zona.
  const parsed = new Date(`${inputValue}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return `Día ${dayOfMonth}`;
  }

  const formatted = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
  return `Día ${dayOfMonth} · ${formatted}`;
}

/**
 * Programadas sin partida este mes: agregar la partida del periodo en un clic, sin reescribir.
 * Cada fila es opt-in por plantilla y mes; las que ya tienen partida no llegan aquí (el modelo
 * las filtra) en vez de ofrecer un botón que choque con el 400 del backend.
 */
export function BudgetTemplatesPanel({ templates, period, periodLabel, addingId, onAdd }: Props) {
  if (templates.length === 0) {
    return null;
  }

  return (
    <section aria-label="Programadas sin partida este mes" className="app-panel px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="m-0 text-xs font-bold text-primary">Programadas sin partida este mes</h2>
        <p className="m-0 text-[11px] font-medium text-muted">
          Un clic crea la partida de {periodLabel} ligada a la programada, sin reescribir.
        </p>
      </div>

      <ul className="m-0 mt-2 space-y-1.5 p-0" style={{ listStyle: "none" }}>
        {templates.map((template) => {
          const busy = addingId === template.recurringItemId;
          return (
            <li
              key={template.recurringItemId}
              className="flex flex-wrap items-center justify-between gap-2 border border-default bg-[var(--color-surface-2)] px-2.5 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="m-0 text-xs font-bold text-primary">{template.name}</p>
                  <span className={budgetItemKindBadgeClass(template.kind)}>{budgetItemKindLabel(template.kind)}</span>
                </div>
                <p className="m-0 mt-0.5 text-[11px] font-medium text-muted">
                  {template.amountMode === "average" || template.amountMxn === null
                    ? "Promedio del historial"
                    : formatCurrency(template.amountMxn)}
                  {" · "}
                  {formatPlannedDay(template.dayOfMonth, period)}
                </p>
              </div>

              <Button
                type="button"
                variant="primary"
                className="h-8 rounded-none px-3 text-xs font-bold"
                loading={busy}
                loadingText="Agregando..."
                disabled={addingId !== null}
                onClick={() => onAdd(template)}
                aria-label={`Agregar ${template.name} a ${periodLabel}`}
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                <span>Agregar</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
