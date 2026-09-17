"use client";

import { Alert } from "@/components/ui/alert";
import { ProjectionCharts } from "@/app/(app)/dashboard/_components/balance-line-chart";
import { DashboardMetricCards } from "@/app/(app)/dashboard/_components/dashboard-metric-cards";
import { DashboardPanelSkeleton } from "@/app/(app)/dashboard/_components/dashboard-skeleton";
import { formatDate } from "@/app/(app)/dashboard/_components/dashboard-format";
import { PROJECTION_HORIZONS } from "@/app/(app)/dashboard/_lib/dashboard-tabs";
import { cn } from "@/lib/ui/cn";
import type { DashboardProjectionResponse } from "@/lib/contracts/dashboard";

type ProyeccionTabProps = {
  projection: DashboardProjectionResponse | null;
  loading: boolean;
  error: string | null;
  horizon: number;
  onHorizonChange: (months: number) => void;
  timezone: string;
};

export function ProyeccionTab({ projection, loading, error, horizon, onHorizonChange, timezone }: ProyeccionTabProps) {
  const hasSufficientHistory = projection?.trend.hasSufficientHistory ?? false;
  return (
    <div className="grid gap-4">
      <section className="app-panel grid gap-3 p-4 sm:flex sm:items-end sm:justify-between sm:p-5">
        <div className="space-y-1">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">Horizonte de proyección</p>
          <p className="m-0 text-sm text-muted">
            Escenario al día de hoy
            {projection?.asOfDate ? ` · actualizado al ${formatDate(projection.asOfDate, timezone)}` : ""}. No depende del
            mes seleccionado.
          </p>
        </div>

        <div className="flex gap-1 rounded-[var(--radius-sm)] border border-default bg-[var(--color-surface-1)] p-1">
          {PROJECTION_HORIZONS.map((months) => {
            const isActive = months === horizon;
            return (
              <button
                key={months}
                type="button"
                onClick={() => onHorizonChange(months)}
                aria-pressed={isActive}
                className={cn(
                  "dashboard-touch-target rounded-md px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]",
                  isActive
                    ? "bg-[var(--color-accent-soft)] text-primary"
                    : "text-muted hover:bg-[var(--color-surface-3)] hover:text-primary"
                )}
              >
                {months} meses
              </button>
            );
          })}
        </div>
      </section>

      {loading ? (
        <DashboardPanelSkeleton label="Cargando proyección de efectivo" cards={3} blocks={2} />
      ) : error || !projection ? (
        <Alert variant="danger">{error ?? "No se pudo cargar la proyección de efectivo"}</Alert>
      ) : (
        <>
          <DashboardMetricCards
            items={[
              {
                title: "Saldo efectivo real",
                subtitle: "Cuentas de efectivo al día de hoy",
                amount: projection.cashRealBalance
              },
              {
                title: "Neto mensual proyectado",
                subtitle: hasSufficientHistory
                  ? `Promedio neto por mes · ${projection.trend.sampleMonths} meses de historial`
                  : "Historial insuficiente para estimar",
                amount: hasSufficientHistory ? projection.trend.projectedMonthlyNet : null
              },
            ]}
            columns="sm:grid-cols-3"
          />

          {hasSufficientHistory ? null : (
            <Alert variant="info">Aún no hay historial suficiente para estimar una tendencia.</Alert>
          )}

          <ProjectionCharts
            historicalMonths={projection.historicalMonths}
            months={projection.months}
            cashRealBalance={projection.cashRealBalance}
            hasSufficientHistory={hasSufficientHistory}
          />
        </>
      )}
    </div>
  );
}
