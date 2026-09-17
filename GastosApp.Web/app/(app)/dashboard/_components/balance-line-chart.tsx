import { BarChart3, LineChart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatAmount, formatCompactAmount, formatMonthLabel } from "@/app/(app)/dashboard/_components/dashboard-format";
import type { DashboardProjectionHistoricalMonth, DashboardProjectionMonth } from "@/lib/contracts/dashboard";

type ProjectionChartsProps = {
  historicalMonths: DashboardProjectionHistoricalMonth[];
  months: DashboardProjectionMonth[];
  cashRealBalance: number;
  hasSufficientHistory: boolean;
};

const CHART_WIDTH = 720;
const CHART_HEIGHT = 280;
const PADDING = { top: 20, right: 16, bottom: 40, left: 64 };
const PLOT_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

type ChartPoint = { label: string; value: number };

function domainFor(values: number[]) {
  const finiteValues = values.filter(Number.isFinite);
  let min = Math.min(...finiteValues, 0);
  let max = Math.max(...finiteValues, 0);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const padding = (max - min) * 0.1;
  return { min: min - padding, max: max + padding };
}

function xFor(index: number, count: number) {
  return count <= 1 ? PADDING.left + PLOT_WIDTH / 2 : PADDING.left + (index / (count - 1)) * PLOT_WIDTH;
}

function yFor(value: number, min: number, max: number) {
  return PADDING.top + (1 - (value - min) / (max - min)) * PLOT_HEIGHT;
}

function ChartGrid({ min, max }: { min: number; max: number }) {
  return (
    <>
      {[max, 0, min].map((value) => (
        <g key={`grid-${value}`}>
          <line
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={yFor(value, min, max)}
            y2={yFor(value, min, max)}
            stroke="var(--color-border)"
            strokeWidth={1}
            strokeDasharray={value === 0 ? undefined : "4 4"}
          />
          <text
            x={PADDING.left - 8}
            y={yFor(value, min, max) + 3}
            textAnchor="end"
            fontSize={10}
            fill="var(--color-text-muted)"
          >
            {formatCompactAmount(value)}
          </text>
        </g>
      ))}
    </>
  );
}

function AxisLabels({ points }: { points: ChartPoint[] }) {
  return (
    <>
      {points.map((point, index) => (
        <text
          key={`axis-${point.label}-${index}`}
          x={xFor(index, points.length)}
          y={CHART_HEIGHT - 18}
          textAnchor="middle"
          fontSize={9}
          fill="var(--color-text-muted)"
          opacity={points.length > 12 && index % 2 !== 0 ? 0 : 1}
        >
          {point.label === "Hoy" ? "Hoy" : formatMonthLabel(point.label)}
        </text>
      ))}
    </>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted" aria-label="Leyenda del gráfico">{children}</div>;
}

function Swatch({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${className}`} aria-hidden="true" />
      {children}
    </span>
  );
}

function ProjectionPanel({
  title,
  description,
  icon,
  children
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="dashboard-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          {icon}
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="m-0 text-base font-semibold text-primary">{title}</h3>
          <p className="m-0 text-xs text-muted">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

export function ProjectionCharts({ historicalMonths, months, cashRealBalance, hasSufficientHistory }: ProjectionChartsProps) {
  return (
    <div className="grid gap-4">
      <NetFlowChart historicalMonths={historicalMonths} months={months} hasSufficientHistory={hasSufficientHistory} />
      <CashBalanceProjectionChart months={months} cashRealBalance={cashRealBalance} />
    </div>
  );
}

function NetFlowChart({
  historicalMonths,
  months,
  hasSufficientHistory
}: Pick<ProjectionChartsProps, "historicalMonths" | "months" | "hasSufficientHistory">) {
  const history = historicalMonths.filter((month) => month.hasActivity);
  const future = hasSufficientHistory ? months : [];
  const points = [
    ...historicalMonths.map((month) => ({ label: month.month, value: month.net })),
    ...future.map((month) => ({ label: month.month, value: month.projectedNet }))
  ];
  const values = points.map((point) => point.value);
  const { min, max } = domainFor(values);
  const zeroY = yFor(0, min, max);
  const barWidth = Math.min(Math.max((PLOT_WIDTH / Math.max(points.length, 1)) * 0.45, 6), 30);
  const hasData = history.length > 0 || future.length > 0;
  const ariaLabel = `Flujo neto mensual: ${history.length} meses históricos con movimientos y ${future.length} meses netos proyectados.`;

  return (
    <ProjectionPanel
      title="Flujo neto mensual"
      description="Barras de flujo real histórico y, si hay historial suficiente, neto proyectado futuro. No representa saldo."
      icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
    >
      {!hasData ? (
        <p className="app-panel m-0 border-dashed px-4 py-7 text-center text-sm text-muted">No hay flujo registrado ni proyección suficiente para dibujar.</p>
      ) : (
        <figure className="m-0 grid gap-3">
          <Legend>
            <Swatch className="dashboard-bar-income">Neto histórico positivo</Swatch>
            <Swatch className="dashboard-bar-expense">Neto histórico negativo</Swatch>
            {hasSufficientHistory ? <Swatch className="dashboard-bar-credit">Neto proyectado futuro</Swatch> : null}
          </Legend>
          <div className="overflow-x-auto pb-1" role="img" aria-label={ariaLabel}>
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-auto w-full min-w-[34rem]" role="presentation" aria-hidden="true">
              <ChartGrid min={min} max={max} />
              {points.map((point, index) => {
                const isFuture = index >= historicalMonths.length;
                // Mes sin actividad no es neto histórico cero: no dibujar barra.
                if (!isFuture && !historicalMonths[index].hasActivity) {
                  return null;
                }
                const isPositive = point.value >= 0;
                const valueY = yFor(point.value, min, max);
                return (
                  <rect
                    key={`${point.label}-${index}`}
                    x={xFor(index, points.length) - barWidth / 2}
                    y={Math.min(zeroY, valueY)}
                    width={barWidth}
                    height={Math.max(Math.abs(zeroY - valueY), 1)}
                    rx={3}
                    fill={isFuture ? "var(--color-credit)" : isPositive ? "var(--color-success)" : "var(--color-danger)"}
                    opacity={isFuture ? 0.7 : 0.6}
                  >
                    <title>{`${formatMonthLabel(point.label)} · ${isFuture ? "neto proyectado" : "neto histórico"} ${formatAmount(point.value)}`}</title>
                  </rect>
                );
              })}
              <AxisLabels points={points} />
            </svg>
          </div>
          <figcaption className="text-xs text-muted">
            {hasSufficientHistory
              ? "Cada barra muestra flujo neto: ingresos menos gastos. La sección posterior al historial es estimada; ningún saldo se mezcla aquí."
              : "Solo se muestra flujo neto histórico registrado. Sin historial suficiente no se fabrica una proyección."}
          </figcaption>
          <details className="app-panel rounded-[var(--radius-sm)] px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-primary focus-ring">Ver datos del gráfico</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">Datos de flujo neto mensual</caption>
                <thead className="text-secondary"><tr><th scope="col" className="px-2 py-2 text-left">Mes</th><th scope="col" className="px-2 py-2 text-left">Serie</th><th scope="col" className="px-2 py-2 text-right">Valor</th></tr></thead>
                <tbody>
                  {points.map((point, index) => (
                    <tr key={`flow-row-${point.label}-${index}`} className="border-default border-t">
                      <td className="px-2 py-2 text-secondary">{formatMonthLabel(point.label)}</td>
                      <td className="px-2 py-2 text-secondary">{index >= historicalMonths.length ? "Neto proyectado" : "Neto histórico"}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums text-primary">{formatAmount(point.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </figure>
      )}
    </ProjectionPanel>
  );
}

function CashBalanceProjectionChart({ months, cashRealBalance }: Pick<ProjectionChartsProps, "months" | "cashRealBalance">) {
  const basePoints: ChartPoint[] = [{ label: "Hoy", value: cashRealBalance }, ...months.map((month) => ({ label: month.month, value: month.projectedCashBalance }))];
  const hasMsiScenario = months.length > 0 && months.every((month) => month.msiPaymentScenarioBalance !== null);
  const msiPoints = hasMsiScenario
    ? [{ label: "Hoy", value: cashRealBalance }, ...months.map((month) => ({ label: month.month, value: month.msiPaymentScenarioBalance as number }))]
    : [];
  const allValues = [...basePoints, ...msiPoints].map((point) => point.value);
  const { min, max } = domainFor(allValues);
  const hasData = months.length > 0;
  const ariaLabel = `Saldo de efectivo proyectado desde Hoy hasta ${months.length} meses futuros.${msiPoints.length > 0 ? " Incluye escenario base y escenario con pagos MSI." : ""}`;

  return (
    <ProjectionPanel
      title="Saldo de efectivo proyectado"
      description="Línea desde Hoy al futuro; no representa ni inventa saldo histórico."
      icon={<LineChart className="h-4 w-4" aria-hidden="true" />}
    >
      {!hasData ? (
        <p className="app-panel m-0 border-dashed px-4 py-7 text-center text-sm text-muted">No hay meses futuros para proyectar.</p>
      ) : (
        <figure className="m-0 grid gap-3">
          <Legend>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-dashed border-[var(--color-credit)]" aria-hidden="true" /> Escenario base</span>
            {msiPoints.length > 0 ? <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-dotted border-[var(--color-warning)]" aria-hidden="true" /> Con pagos MSI</span> : null}
          </Legend>
          <div className="overflow-x-auto pb-1" role="img" aria-label={ariaLabel}>
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-auto w-full min-w-[34rem]" role="presentation" aria-hidden="true">
              <ChartGrid min={min} max={max} />
              <polyline points={basePoints.map((point, index) => `${xFor(index, basePoints.length)},${yFor(point.value, min, max)}`).join(" ")} fill="none" stroke="var(--color-credit)" strokeWidth={2.5} strokeDasharray="6 5" strokeLinejoin="round" strokeLinecap="round" />
              {msiPoints.length > 0 ? <polyline points={msiPoints.map((point, index) => `${xFor(index, msiPoints.length)},${yFor(point.value, min, max)}`).join(" ")} fill="none" stroke="var(--color-warning)" strokeWidth={2.5} strokeDasharray="2 5" strokeLinejoin="round" strokeLinecap="round" /> : null}
              {basePoints.map((point, index) => <circle key={`base-${point.label}-${index}`} cx={xFor(index, basePoints.length)} cy={yFor(point.value, min, max)} r={3} fill="var(--color-credit)"><title>{`${point.label} · base ${formatAmount(point.value)}`}</title></circle>)}
              {msiPoints.map((point, index) => <circle key={`msi-${point.label}-${index}`} cx={xFor(index, msiPoints.length)} cy={yFor(point.value, min, max)} r={3} fill="var(--color-warning)"><title>{`${point.label} · con pagos MSI ${formatAmount(point.value)}`}</title></circle>)}
              <AxisLabels points={basePoints} />
            </svg>
          </div>
          <figcaption className="text-xs text-muted">
            La línea empieza en el saldo real de Hoy. El escenario MSI solo aparece porque el payload aporta `msiPaymentScenarioBalance`; no se dibuja saldo histórico.
          </figcaption>
          <details className="app-panel rounded-[var(--radius-sm)] px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-primary focus-ring">Ver datos del gráfico</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">Datos de saldo de efectivo proyectado</caption>
                <thead className="text-secondary"><tr><th scope="col" className="px-2 py-2 text-left">Momento</th><th scope="col" className="px-2 py-2 text-right">Base</th>{msiPoints.length > 0 ? <th scope="col" className="px-2 py-2 text-right">Con pagos MSI</th> : null}</tr></thead>
                <tbody>
                  {basePoints.map((point, index) => <tr key={`balance-row-${point.label}-${index}`} className="border-default border-t"><td className="px-2 py-2 text-secondary">{point.label === "Hoy" ? point.label : formatMonthLabel(point.label)}</td><td className="px-2 py-2 text-right font-semibold tabular-nums text-primary">{formatAmount(point.value)}</td>{msiPoints.length > 0 ? <td className="px-2 py-2 text-right font-semibold tabular-nums text-primary">{formatAmount(msiPoints[index].value)}</td> : null}</tr>)}
                </tbody>
              </table>
            </div>
          </details>
        </figure>
      )}
    </ProjectionPanel>
  );
}
