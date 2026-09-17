import { PiggyBank, Target, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/currency";
import { clampPercent, formatPercent, type BudgetTotals } from "../_lib/budgets-ui";

type Props = {
  totals: BudgetTotals;
  periodLabel: string;
};

export function BudgetsKpis({ totals, periodLabel }: Props) {
  const consumption = totals.budgeted > 0 ? (totals.spent / totals.budgeted) * 100 : 0;
  const remainingTone = totals.remaining < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]";

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Resumen del periodo">
      <Card className="dashboard-card dashboard-card-interactive p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Total presupuestado</p>
            <p className="mt-1 text-[11px] font-medium text-muted">{periodLabel}</p>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Target className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-4 truncate text-2xl font-semibold tabular-nums tracking-tight text-primary">{formatCurrency(totals.budgeted)}</p>
      </Card>

      <Card className="dashboard-card dashboard-card-interactive p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Total gastado</p>
            <p className="mt-1 text-[11px] font-medium text-muted">{formatPercent(consumption)} del total</p>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <TrendingDown className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-4 truncate text-2xl font-semibold tabular-nums tracking-tight text-primary">{formatCurrency(totals.spent)}</p>
        <div className="dashboard-track mt-3 h-1.5 w-full overflow-hidden rounded-full">
          <div className="dashboard-bar-accent h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${clampPercent(consumption)}%` }} />
        </div>
      </Card>

      <Card className="dashboard-card dashboard-card-interactive p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Total restante</p>
            <p className="mt-1 text-[11px] font-medium text-muted">
              {totals.activeCount} de {totals.totalCount} límites activos
            </p>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <PiggyBank className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
        <p className={`mt-4 truncate text-2xl font-semibold tabular-nums tracking-tight ${remainingTone}`}>{formatCurrency(totals.remaining)}</p>
      </Card>
    </section>
  );
}
