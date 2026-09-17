import { AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/format/currency";
import { cn } from "@/lib/ui/cn";
import {
  budgetStatusBadgeClass,
  budgetStatusLabel,
  describeBudgetScope,
  formatPercent,
  type BudgetCatalogIndex
} from "../_lib/budgets-ui";
import type { BudgetRow } from "../_hooks/use-budgets-admin";
import { BudgetActionsMenu } from "./budget-actions-menu";
import { BudgetProgress } from "./budget-progress";
import { BudgetThresholdChips } from "./budget-threshold-chips";

type Props = {
  rows: BudgetRow[];
  loading: boolean;
  errorMessage?: string | null;
  catalogs: BudgetCatalogIndex;
  onEdit: (row: BudgetRow) => void;
  onToggleActive: (row: BudgetRow) => void;
};

export function BudgetsMobileList({ rows, loading, errorMessage, catalogs, onEdit, onToggleActive }: Props) {
  if (loading) {
    return (
      <div className="space-y-2.5 md:hidden" role="status" aria-live="polite" aria-label="Cargando presupuestos">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="animate-pulse border border-default bg-[var(--color-surface-2)] p-3">
            <div className="h-3 w-32 rounded-none bg-[var(--color-surface-3)]" />
            <div className="mt-2 h-2.5 w-44 rounded-none bg-[var(--color-surface-3)]" />
            <div className="mt-3 h-10 rounded-none bg-[var(--color-surface-3)]" />
            <div className="mt-3 h-8 rounded-none bg-[var(--color-surface-3)]" />
          </div>
        ))}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="border-[var(--color-danger)]/35 bg-[var(--color-danger)]/12 p-4 text-[var(--color-danger)] md:hidden" role="alert" aria-live="assertive">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Error al cargar presupuestos</p>
            <p className="mt-1 text-xs font-medium">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5 md:hidden">
      {rows.map((row) => {
        const { status, thresholds } = row;
        const scope = describeBudgetScope(status, catalogs);
        const isNegative = status.remaining < 0;

        return (
          <li key={status.budgetId}>
            <article className="dashboard-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="m-0 truncate text-sm font-bold text-primary">{status.name}</h3>
                  <p className="m-0 text-[11px] font-medium text-muted">
                    {scope.label}
                    {scope.hint ? ` · ${scope.hint}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={budgetStatusBadgeClass(status.status)}>{budgetStatusLabel(status.status)}</span>
                  {status.active ? null : <span className="tabler-badge">Inactivo</span>}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="dashboard-subtle p-2">
                  <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Gastado</p>
                  <p className="m-0 text-sm font-bold tabular-nums text-primary">{formatCurrency(status.spent)}</p>
                  <p className="m-0 text-[10px] font-medium text-muted">de {formatCurrency(status.amountMxn)}</p>
                </div>
                <div className="dashboard-subtle p-2">
                  <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Restante</p>
                  <p className={cn("m-0 text-sm font-bold tabular-nums", isNegative ? "text-[var(--color-danger)]" : "text-[var(--color-success)]")}>
                    {formatCurrency(status.remaining)}
                  </p>
                  <p className="m-0 text-[10px] font-medium text-muted">{status.active ? "Presupuesto activo" : "Presupuesto en pausa"}</p>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-muted">
                  <span>Avance</span>
                  <span className="tabular-nums text-secondary">{formatPercent(status.percentUsed)}</span>
                </div>
                <BudgetProgress percentUsed={status.percentUsed} status={status.status} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Umbrales</span>
                <BudgetThresholdChips
                  thresholds={thresholds}
                  reachedThresholdId={status.reachedThreshold?.thresholdId ?? null}
                  status={status.status}
                />
              </div>

              <div className="mt-3">
                <BudgetActionsMenu status={status} mobile onEdit={() => onEdit(row)} onToggleActive={() => onToggleActive(row)} />
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
