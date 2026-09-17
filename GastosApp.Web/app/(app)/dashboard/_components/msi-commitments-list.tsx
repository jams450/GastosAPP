import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatAmount, formatDate } from "@/app/(app)/dashboard/_components/dashboard-format";
import type { DashboardProjectionMsiPlan } from "@/lib/contracts/dashboard";

type MsiCommitmentsListProps = {
  plans: DashboardProjectionMsiPlan[];
  timezone: string;
};

export function MsiCommitmentsList({ plans, timezone }: MsiCommitmentsListProps) {
  return (
    <Card className="dashboard-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="m-0 text-base font-semibold text-primary">Compromisos MSI por plan</h3>
          <p className="m-0 text-xs text-muted">
            Cuotas a meses sin intereses ya adquiridas. No son gasto nuevo del mes ni flujo real.
          </p>
        </div>
      </div>

      {plans.length === 0 ? (
        <p className="app-panel m-0 border-dashed px-4 py-7 text-center text-sm text-muted">
          No hay planes MSI con saldo pendiente en el horizonte.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {plans.map((plan, index) => (
            <li
              key={`${plan.planId ?? plan.accountId ?? "plan"}-${index}`}
              className="dashboard-subtle rounded-[var(--radius-sm)] px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-semibold text-primary" title={plan.accountName}>
                    {plan.accountName}
                  </p>
                  <p className="m-0 text-xs text-muted">
                    {plan.openInstallments === null
                      ? "Cuotas abiertas sin dato"
                      : `${plan.openInstallments} cuotas abiertas`}
                  </p>
                  <p className="m-0 mt-1 text-xs text-secondary">
                    {plan.description ?? "Descripción del plan no disponible"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="m-0 text-sm font-semibold tabular-nums dashboard-money-credit">
                    {formatAmount(plan.remainingAmount)}
                  </p>
                  <p className="m-0 text-xs text-muted">Pendiente por pagar</p>
                </div>
              </div>

              <dl className="mb-0 mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div className="flex flex-wrap items-center gap-1">
                  <dt className="m-0 text-muted">Próximo vencimiento:</dt>
                  <dd className="m-0 font-medium text-primary">
                    {plan.nextDueDate ? formatDate(plan.nextDueDate, timezone) : "Sin fecha"}
                    {plan.nextDueAmount !== null ? ` · ${formatAmount(plan.nextDueAmount)}` : ""}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <dt className="m-0 text-muted">Termina el:</dt>
                  <dd className="m-0 font-medium text-primary">
                    {plan.endsOn ? formatDate(plan.endsOn, timezone) : "Sin fecha de término"}
                  </dd>
                </div>
              </dl>

              {plan.scheduleComplete ? null : (
                <p className="mb-0 mt-2 text-xs font-medium text-[var(--color-warning)]">Calendario incompleto</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
