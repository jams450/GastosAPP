import { CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatAmount } from "@/app/(app)/dashboard/_components/dashboard-format";
import { resolveAccountCredit } from "@/app/(app)/dashboard/_lib/dashboard-metrics";
import type { DashboardAccountOverview } from "@/lib/contracts/dashboard";

type CreditUtilizationListProps = {
  accounts: DashboardAccountOverview[];
  emptyMessage: string;
};

export function CreditUtilizationList({ accounts, emptyMessage }: CreditUtilizationListProps) {
  return (
    <Card className="dashboard-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <CreditCard className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="m-0 text-base font-semibold text-primary">Utilización por tarjeta</h3>
          <p className="m-0 text-xs text-muted">
            Deuda pendiente (normal + MSI) sobre el límite de crédito. Sin límite registrado no se muestra porcentaje.
          </p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="app-panel m-0 border-dashed px-4 py-7 text-center text-sm text-muted">{emptyMessage}</p>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0">
          {accounts.map((account) => {
            const metrics = resolveAccountCredit(account);
            const barWidth = metrics.utilization === null ? 0 : Math.min(metrics.utilization, 100);
            const percentageLabel = metrics.utilization === null ? "Sin porcentaje" : `${metrics.utilization.toFixed(1)}%`;

            return (
              <li key={account.accountId} className="grid gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-semibold text-primary" title={account.name}>
                      {account.name}
                    </p>
                    <p className="m-0 text-xs text-muted">
                      Límite: {metrics.creditLimit === null ? "No disponible" : formatAmount(metrics.creditLimit)} · Deuda:{" "}
                      {formatAmount(metrics.debt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {metrics.exceeded ? (
                      <span className="rounded-full border border-[var(--color-danger)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">
                        Excedido
                      </span>
                    ) : metrics.utilization === null ? (
                      <span className="rounded-full border border-default px-2 py-0.5 text-[11px] font-semibold text-muted">
                        Sin límite
                      </span>
                    ) : null}
                    <span className={`text-sm font-semibold tabular-nums ${metrics.exceeded ? "dashboard-money-expense" : "text-primary"}`}>
                      {percentageLabel}
                    </span>
                  </div>
                </div>

                <span className="dashboard-track h-2.5 overflow-hidden rounded-full">
                  <span
                    className={`block h-full rounded-full ${metrics.exceeded ? "dashboard-bar-expense" : "dashboard-bar-credit"}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </span>

                <p className={`m-0 text-xs ${metrics.available === null ? "text-muted" : metrics.available < 0 ? "dashboard-money-expense" : "dashboard-money-income"}`}>
                  {metrics.available === null ? "Disponible: No disponible" : `Disponible: ${formatAmount(metrics.available)}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
