"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { DashboardMetricCards } from "@/app/(app)/dashboard/_components/dashboard-metric-cards";
import { DashboardPanelSkeleton } from "@/app/(app)/dashboard/_components/dashboard-skeleton";
import { formatAmount, formatDate, formatMonthLabel } from "@/app/(app)/dashboard/_components/dashboard-format";
import { PROJECTION_HORIZONS } from "@/app/(app)/dashboard/_lib/dashboard-tabs";
import {
  hasProjectionContent,
  projectionBaseBasisLabel,
  projectionDeviationBreakdown,
  projectionInvestmentSummary,
  projectionMethodNet
} from "@/app/(app)/dashboard/_lib/projection-chart";
import type { ProjectionDeviationBreakdownRowKey, ProjectionEconomicMethod } from "@/app/(app)/dashboard/_lib/projection-chart";
import { cn } from "@/lib/ui/cn";
import type { DashboardProjectionResponse } from "@/lib/contracts/dashboard";

// Recharts 3.x mide el DOM en efectos: sin SSR para evitar desajuste de hidratación
// y los avisos width(-1)/height(-1) de ResponsiveContainer.
const ProjectionCharts = dynamic(
  () => import("@/app/(app)/dashboard/_components/projection-charts").then((mod) => mod.ProjectionCharts),
  {
    ssr: false,
    loading: () => <DashboardPanelSkeleton label="Cargando proyección de efectivo" cards={3} blocks={2} />
  }
);

type ProyeccionTabProps = {
  projection: DashboardProjectionResponse | null;
  loading: boolean;
  error: string | null;
  horizon: number;
  onHorizonChange: (months: number) => void;
  timezone: string;
};

const DEVIATION_LABELS: Record<ProjectionDeviationBreakdownRowKey, string> = {
  incomeDeviation: "Ingresos: real menos planificado",
  expenseDeviation: "Gastos: planificado menos real",
  unplannedDeviation: "Sin partida: ingreso menos gasto no planeado",
  monthlyAdjustment: "Ajuste mensual promedio"
};

export function ProyeccionTab({ projection, loading, error, horizon, onHorizonChange, timezone }: ProyeccionTabProps) {
  const [method, setMethod] = useState<ProjectionEconomicMethod>("base");
  const hasSufficientHistory = projection?.trend.hasSufficientHistory ?? false;
  const months = projection?.months ?? [];
  const investment = projectionInvestmentSummary(months);
  const hasProjectionData = hasProjectionContent(months);
  const deviation = projection?.deviation;
  const deviationApplied = deviation?.hasSufficientSample ?? false;
  const isAdjusted = method === "adjusted";
  const methodLabel = isAdjusted ? "ajustado por desviación" : "base (plan o histórico)";
  const averageMethodNet =
    months.length > 0 ? months.reduce((total, month) => total + projectionMethodNet(month, method), 0) / months.length : null;
  const averageInvestment = months.length > 0 ? months.reduce((total, month) => total + month.investmentEstimate, 0) / months.length : null;
  const averageMsi = months.length > 0 ? months.reduce((total, month) => total + month.msiCommitment, 0) / months.length : null;
  const averageNormalCredit =
    months.length > 0 ? months.reduce((total, month) => total + month.normalCreditPayment, 0) / months.length : null;
  const averageDeviation =
    months.length > 0 ? months.reduce((total, month) => total + month.deviationAdjustment, 0) / months.length : null;
  const basisSummary =
    Array.from(new Set(months.map((month) => projectionBaseBasisLabel(month.baseEconomicBasis)))).join(" · ") || "sin datos";
  // El promedio puede combinar meses con plan e histórico; muestra todas las bases presentes.
  const netBasisLabel = `Promedio del horizonte · ${basisSummary} · método ${methodLabel}`;
  const deviationRows = deviation ? projectionDeviationBreakdown(deviation) : [];

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
                amount: projection.cashRealBalance,
                note: "Solo efectivo; excluye rendimientos estimados de inversión."
              },
              {
                title: isAdjusted ? "Neto mensual estimado · ajustado" : "Neto mensual estimado · base",
                subtitle: netBasisLabel,
                amount: averageMethodNet,
                note: isAdjusted
                  ? "Base más la desviación histórica promedio; es un estimado, no efectivo recibido ni ingreso confirmado."
                  : "Plan pendiente o tendencia histórica, más rendimiento estimado, menos MSI y crédito normal. Es un estimado, no efectivo recibido."
              },
              {
                title: "Crédito normal",
                subtitle: "Promedio mensual · cuotas Revolving abiertas por vencer",
                amount: months.length > 0 ? averageNormalCredit : null,
                note: "Se resta del neto base, aparte de la MSI; no infiere un pago mínimo."
              },
              {
                title: "Compromiso MSI",
                subtitle: "Promedio mensual del horizonte",
                amount: months.length > 0 ? averageMsi : null,
                note: "Se descuenta del neto base, aparte del presupuesto y del crédito normal."
              },
              {
                title: "Rendimiento estimado",
                subtitle: investment.latestSourcePlanMonth
                  ? `Promedio mensual · plan guardado de ${formatMonthLabel(investment.latestSourcePlanMonth)}`
                  : "Sin plan de inversión guardado aplicable",
                amount: investment.hasEstimate ? averageInvestment : null,
                note: "Es un estimado: no es efectivo recibido ni entra al saldo."
              },
              {
                title: "Ajuste por desviación",
                subtitle: deviationApplied ? `Muestra de ${deviation?.sampleSize ?? 0} meses completos` : "Sin muestra suficiente",
                amount: deviationApplied ? averageDeviation : null,
                note: deviationApplied
                  ? "Sólo lo aplica el método ajustado; el método base no lo incluye."
                  : "No hay desviación conocida: el método ajustado queda igual al base."
              }
            ]}
            columns="sm:grid-cols-2 xl:grid-cols-3"
          />

          <section className="app-panel grid gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">Método de proyección</p>
                <p className="m-0 text-sm text-muted">
                  Ambos métodos parten de la misma base por mes ({basisSummary}). Sólo cambia si se suma la desviación observada.
                </p>
              </div>
              <div
                role="group"
                aria-label="Método de proyección"
                className="flex gap-1 rounded-[var(--radius-sm)] border border-default bg-[var(--color-surface-1)] p-1"
              >
                {(["base", "adjusted"] as const).map((option) => {
                  const isActive = option === method;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setMethod(option)}
                      aria-pressed={isActive}
                      className={cn(
                        "dashboard-touch-target rounded-md px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]",
                        isActive
                          ? "bg-[var(--color-accent-soft)] text-primary"
                          : "text-muted hover:bg-[var(--color-surface-3)] hover:text-primary"
                      )}
                    >
                      {option === "base" ? "Base" : "Ajustado"}
                    </button>
                  );
                })}
              </div>
            </div>

            <dl className="m-0 grid gap-2 sm:grid-cols-2">
              <div className="rounded-[var(--radius-sm)] border border-default px-3 py-2">
                <dt className="text-xs font-semibold text-primary">Fórmula base</dt>
                <dd className="m-0 mt-1 text-xs text-muted">
                  Base (plan pendiente o tendencia histórica sin traspasos de liquidación de crédito) + rendimiento estimado − MSI − crédito normal.
                </dd>
              </div>
              <div className="rounded-[var(--radius-sm)] border border-default px-3 py-2">
                <dt className="text-xs font-semibold text-primary">Fórmula ajustada</dt>
                <dd className="m-0 mt-1 text-xs text-muted">
                  Igual que la base + promedio de desviación de los últimos {deviation?.requiredSampleSize ?? 3} meses completos con plan
                  comparable (ingresos, gastos y movimientos sin partida).
                </dd>
              </div>
            </dl>
          </section>

          {deviationApplied && deviation ? (
            <section className="app-panel grid gap-3 p-4 sm:p-5">
              <div className="space-y-1">
                <h3 className="m-0 text-sm font-semibold text-primary">Muestra del ajuste por desviación</h3>
                <p className="m-0 text-xs text-muted">
                  {deviation.sampleSize} de {deviation.requiredSampleSize} meses completos con plan comparable.
                  {deviation.sampledMonths.length > 0
                    ? ` Muestra: ${deviation.sampledMonths.map((month) => formatMonthLabel(month)).join(", ")}.`
                    : ""}
                  {deviation.windowMonths.length > deviation.sampledMonths.length
                    ? ` Ventana candidata: ${deviation.windowMonths.map((month) => formatMonthLabel(month)).join(", ")}.`
                    : ""}{" "}
                  Se excluyen traspasos de liquidación de crédito y compras financiadas.
                </p>
              </div>
              <ul className="m-0 grid list-none gap-1.5 p-0 sm:grid-cols-2">
                {deviationRows.map((row) => (
                  <li
                    key={row.key}
                    className="flex items-center justify-between gap-4 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-xs"
                  >
                    <span className="text-muted">{DEVIATION_LABELS[row.key]}</span>
                    <span className="font-semibold tabular-nums text-primary">{formatAmount(row.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="m-0 text-[11px] text-muted">
                Una desviación negativa reduce el neto y una positiva lo aumenta. El ajuste es el mismo en todo el horizonte y sólo lo aplica
                el método ajustado.
              </p>
            </section>
          ) : (
            <Alert variant="info">
              El método ajustado no tiene muestra suficiente ({deviation?.sampleSize ?? 0} de {deviation?.requiredSampleSize ?? 3} meses
              completos con plan comparable). Por eso el escenario ajustado se muestra igual al base: no es una desviación cero conocida.
            </Alert>
          )}

          {hasSufficientHistory ? null : hasProjectionData ? (
            <Alert variant="info">
              Sin historial suficiente para estimar una tendencia, pero hay meses con presupuesto, rendimientos estimados, MSI o crédito
              normal: se muestran esos datos en lugar de ocultarlos.
            </Alert>
          ) : (
            <Alert variant="info">Aún no hay historial suficiente para estimar una tendencia.</Alert>
          )}

          <ProjectionCharts
            historicalMonths={projection.historicalMonths}
            months={projection.months}
            cashRealBalance={projection.cashRealBalance}
            hasSufficientHistory={hasSufficientHistory}
            method={method}
            deviation={projection.deviation}
          />
        </>
      )}
    </div>
  );
}
