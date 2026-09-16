import { CalendarClock } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { DashboardFoldSection } from "@/app/(app)/dashboard/_components/dashboard-fold-section";
import { DashboardMetricCards, type DashboardMetricCardItem } from "@/app/(app)/dashboard/_components/dashboard-metric-cards";
import { ProjectionChart } from "@/app/(app)/dashboard/_components/projection-chart";
import { formatAmount, formatDate } from "@/app/(app)/dashboard/_components/dashboard-format";
import type { DashboardProjectionMsiPlan, DashboardProjectionResponse } from "@/lib/contracts/dashboard";

type CashProjectionSectionProps = {
  data: DashboardProjectionResponse | null;
  loading: boolean;
  error: string | null;
};

export function CashProjectionSection({ data, loading, error }: CashProjectionSectionProps) {
  const trend = data?.trend ?? null;
  const hasSufficientHistory = trend?.hasSufficientHistory === true;
  const months = data?.months ?? [];
  const msiPlans = data?.msiPlans ?? [];
  const horizonMonths = data?.horizonMonths ?? months.length;
  const msiCommitment = months.reduce((total, month) => total + month.msiCommitment, 0);
  const timezone = data?.timezone ?? "UTC";

  const metrics: DashboardMetricCardItem[] = [
    {
      title: "Saldo efectivo real",
      subtitle: "Cuentas de efectivo al día de hoy",
      amount: data?.cashRealBalance ?? 0
    }
  ];

  if (hasSufficientHistory && trend) {
    metrics.push({
      title: "Tendencia mensual proyectada",
      subtitle: `Promedio neto por mes · ${trend.sampleMonths} meses de historial`,
      amount: trend.projectedMonthlyNet
    });
  }

  metrics.push({
    title: "Compromisos MSI del horizonte",
    subtitle: "Cuotas ya adquiridas con tarjeta; no es gasto ni flujo real",
    amount: msiCommitment,
    toneClass: "dashboard-money-credit"
  });

  return (
    <DashboardFoldSection
      title="Proyección de efectivo"
      description="Escenario de saldo de las cuentas de efectivo y compromisos MSI de los próximos meses."
      badge={error ? "No disponible" : loading ? "Cargando" : `${horizonMonths} meses`}
      defaultCollapsed
      storageKey="dashboard:projection-section"
    >
      {loading ? (
        <ProjectionSkeleton />
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : (
        <div className="grid gap-4">
          <DashboardMetricCards items={metrics} columns={metrics.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"} />

          {hasSufficientHistory ? null : (
            <Alert variant="info">Aún no hay historial suficiente para estimar una tendencia.</Alert>
          )}

          <div className="grid gap-1">
            <p className="m-0 text-xs text-muted">
              Estimación basada en flujo real registrado; no considera movimientos no registrados.
            </p>
            {data?.asOfDate ? (
              <p className="m-0 text-xs text-muted">Actualizado al {formatDate(data.asOfDate, timezone)} · Zona horaria: {timezone}</p>
            ) : null}
          </div>

          <ProjectionChart
            title="Saldo proyectado por mes"
            description={
              hasSufficientHistory
                ? "Saldo base estimado con el flujo real registrado y su escenario pagando MSI al vencimiento."
                : "Escenario de saldo sin tendencia estimada, con historial insuficiente: es una referencia, no una predicción."
            }
            months={months}
          />

          <MsiCommitmentsList plans={msiPlans} timezone={timezone} />
        </div>
      )}
    </DashboardFoldSection>
  );
}

function MsiCommitmentsList({ plans, timezone }: { plans: DashboardProjectionMsiPlan[]; timezone: string }) {
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

function ProjectionSkeleton() {
  return (
    <section className="grid gap-4" aria-busy="true">
      <span className="sr-only">Cargando proyección de efectivo</span>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-default bg-[var(--color-surface-1)]"
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-default bg-[var(--color-surface-1)]" aria-hidden="true" />
    </section>
  );
}
