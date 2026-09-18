"use client";

import { BarChart3, LineChart as LineChartIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { BarShapeProps, TooltipContentProps } from "recharts";
import { Card } from "@/components/ui/card";
import { formatAmount, formatCompactAmount, formatMonthLabel } from "@/app/(app)/dashboard/_components/dashboard-format";
import type { DashboardProjectionHistoricalMonth, DashboardProjectionMonth } from "@/lib/contracts/dashboard";

type ProjectionChartsProps = {
  historicalMonths: DashboardProjectionHistoricalMonth[];
  months: DashboardProjectionMonth[];
  cashRealBalance: number;
  hasSufficientHistory: boolean;
};

// Los tokens de tema se pasan como `var(--color-*)` a propósito: el navegador los
// resuelve en cada render, así que el gráfico sigue al tema (.dark / [data-theme])
// sin capturar colores con getComputedStyle.
const COLOR_SUCCESS = "var(--color-success)";
const COLOR_DANGER = "var(--color-danger)";
const COLOR_CREDIT = "var(--color-credit)";
const COLOR_WARNING = "var(--color-warning)";
const COLOR_GRID = "var(--color-border)";
const COLOR_ZERO_LINE = "var(--color-border-strong)";
const COLOR_MUTED = "var(--color-text-muted)";
const COLOR_SURFACE_3 = "var(--color-surface-3)";
const COLOR_SURFACE_2 = "var(--color-surface-2)";
const COLOR_SURFACE_1 = "var(--color-surface-1)";

// Alto fijo del marco: ResponsiveContainer necesita un padre medible para no
// reportar width(-1)/height(-1) y para no provocar saltos de layout.
const CHART_HEIGHT = 360;
const X_AXIS_HEIGHT = 64;
const BRUSH_HEIGHT = 36;
const Y_AXIS_WIDTH = 72;

const AXIS_TICK = { fontSize: 10, fill: COLOR_MUTED } as const;

/**
 * Dominio numérico con el cero siempre incluido (para que la línea de referencia
 * y las barras tengan una base real) más un 10% de aire, como el gráfico anterior.
 */
const projectionDomain = ([dataMin, dataMax]: readonly [number, number]) => {
  const min = Math.min(0, dataMin);
  const max = Math.max(0, dataMax);
  const padding = max === min ? 1 : (max - min) * 0.1;
  return [min - padding, max + padding] as const;
};

/** El saldo no es un flujo: usa su rango real, sin forzar el cero. */
const balanceDomain = ([dataMin, dataMax]: readonly [number, number]) => {
  const range = dataMax - dataMin;
  const padding = range === 0 ? Math.max(Math.abs(dataMax) * 0.1, 1) : range * 0.1;
  return [dataMin - padding, dataMax + padding] as const;
};

function formatAxisTick(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatCompactAmount(numeric) : "";
}

function periodLabel(month: string): string {
  return month === "Hoy" ? "Hoy" : formatMonthLabel(month);
}

function formatValue(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : formatAmount(value);
}

type FlowDatum = {
  /** Etiqueta ya formateada, usada como categoría del eje X y por el Brush. */
  label: string;
  /** Periodo crudo "YYYY-MM" (o "Hoy"), para formatear en tooltip y tablas. */
  month: string;
  /** Neto real del mes. Se usa en la tabla de datos y en el tooltip. */
  net: number;
  /** Valor dibujado; `null` = mes sin movimientos, no un cero fabricado. */
  bar: number | null;
  hasActivity: boolean;
  projected: boolean;
};

type BalanceDatum = {
  label: string;
  month: string;
  base: number;
  msi: number | null;
};

function TooltipShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-default bg-[color-mix(in_srgb,var(--color-surface-1)_94%,transparent)] px-3 py-2 shadow-[var(--shadow-md)] backdrop-blur">
      <p className="m-0 mb-1 text-xs font-semibold text-primary">{title}</p>
      <ul className="m-0 grid list-none gap-1 p-0">{children}</ul>
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: number | null }) {
  return (
    <li className="flex items-center justify-between gap-4 text-xs">
      <span className="inline-flex items-center gap-1.5 text-muted">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
        {label}
      </span>
      <span className="font-semibold tabular-nums text-primary">{formatValue(value)}</span>
    </li>
  );
}

function FlowTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const datum = payload[0]?.payload as FlowDatum | undefined;
  if (!datum) {
    return null;
  }

  return (
    <TooltipShell title={periodLabel(datum.month)}>
      {datum.hasActivity ? (
        <TooltipRow
          color={datum.projected ? COLOR_CREDIT : datum.net >= 0 ? COLOR_SUCCESS : COLOR_DANGER}
          label={datum.projected ? "Neto proyectado" : "Neto histórico"}
          value={datum.net}
        />
      ) : (
        <li className="text-xs text-muted">Sin movimientos registrados</li>
      )}
    </TooltipShell>
  );
}

function BalanceTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const datum = payload[0]?.payload as BalanceDatum | undefined;
  if (!datum) {
    return null;
  }

  return (
    <TooltipShell title={periodLabel(datum.month)}>
      <TooltipRow color={COLOR_CREDIT} label="Escenario base" value={datum.base} />
      {datum.msi !== null ? <TooltipRow color={COLOR_WARNING} label="Con pagos MSI" value={datum.msi} /> : null}
    </TooltipShell>
  );
}

/**
 * Barra de flujo neto. El color se decide por dato (histórico positivo/negativo,
 * futuro en crédito) y un mes sin actividad no dibuja nada: `Bar` recibe `null`
 * y aquí se vuelve a comprobar para no inventar una barra de valor cero.
 */
function FlowBar(props: BarShapeProps) {
  const datum = props.payload as FlowDatum | undefined;
  if (!datum || !datum.hasActivity || datum.bar === null) {
    return null;
  }

  const height = Math.max(Math.abs(props.height), 1);
  const y = props.height < 0 ? props.y + props.height : props.y;
  const fill = datum.projected ? COLOR_CREDIT : datum.bar >= 0 ? COLOR_SUCCESS : COLOR_DANGER;

  return (
    <rect
      x={props.x}
      y={y}
      width={props.width}
      height={height}
      rx={3}
      fill={fill}
      opacity={datum.projected ? 0.7 : 0.6}
    />
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
  const data: FlowDatum[] = [
    ...historicalMonths.map((month) => ({
      label: formatMonthLabel(month.month),
      month: month.month,
      net: month.net,
      // Mes sin actividad no es neto histórico cero: ocupa su lugar en el eje X pero no dibuja barra.
      bar: month.hasActivity ? month.net : null,
      hasActivity: month.hasActivity,
      projected: false
    })),
    ...future.map((month) => ({
      label: formatMonthLabel(month.month),
      month: month.month,
      net: month.projectedNet,
      bar: month.projectedNet,
      hasActivity: true,
      projected: true
    }))
  ];
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
          <div className="h-[360px] w-full min-w-0" role="img" aria-label={ariaLabel}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={COLOR_GRID} strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={X_AXIS_HEIGHT}
                  tickMargin={8}
                  tick={AXIS_TICK}
                />
                <YAxis
                  width={Y_AXIS_WIDTH}
                  domain={projectionDomain}
                  tickCount={5}
                  tick={AXIS_TICK}
                  tickFormatter={formatAxisTick}
                />
                <ReferenceLine y={0} stroke={COLOR_ZERO_LINE} />
                <Tooltip
                  content={FlowTooltip}
                  filterNull={false}
                  cursor={{ fill: COLOR_SURFACE_3, fillOpacity: 0.35 }}
                  wrapperStyle={{ outline: "none", pointerEvents: "none" }}
                />
                <Bar dataKey="bar" name="Flujo neto" shape={FlowBar} maxBarSize={28} />
                <Brush
                  dataKey="label"
                  height={BRUSH_HEIGHT}
                  travellerWidth={8}
                  stroke={COLOR_MUTED}
                  fill={COLOR_SURFACE_2}
                  startIndex={0}
                  endIndex={Math.max(data.length - 1, 0)}
                  ariaLabel="Rango de meses visible"
                />
              </BarChart>
            </ResponsiveContainer>
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
                  {data.map((datum, index) => (
                    <tr key={`flow-row-${datum.month}-${index}`} className="border-default border-t">
                      <td className="px-2 py-2 text-secondary">{formatMonthLabel(datum.month)}</td>
                      <td className="px-2 py-2 text-secondary">{datum.projected ? "Neto proyectado" : "Neto histórico"}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums text-primary">{formatAmount(datum.net)}</td>
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
  const hasMsiScenario = months.length > 0 && months.every((month) => month.msiPaymentScenarioBalance !== null);
  const data: BalanceDatum[] = [
    { label: "Hoy", month: "Hoy", base: cashRealBalance, msi: hasMsiScenario ? cashRealBalance : null },
    ...months.map((month) => ({
      label: formatMonthLabel(month.month),
      month: month.month,
      base: month.projectedCashBalance,
      msi: hasMsiScenario ? (month.msiPaymentScenarioBalance as number) : null
    }))
  ];
  const hasData = months.length > 0;
  const ariaLabel = `Saldo de efectivo proyectado desde Hoy hasta ${months.length} meses futuros.${hasMsiScenario ? " Incluye escenario base y escenario con pagos MSI." : ""}`;

  return (
    <ProjectionPanel
      title="Saldo de efectivo proyectado"
      description="Línea desde Hoy al futuro; no representa ni inventa saldo histórico."
      icon={<LineChartIcon className="h-4 w-4" aria-hidden="true" />}
    >
      {!hasData ? (
        <p className="app-panel m-0 border-dashed px-4 py-7 text-center text-sm text-muted">No hay meses futuros para proyectar.</p>
      ) : (
        <figure className="m-0 grid gap-3">
          <Legend>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-dashed border-[var(--color-credit)]" aria-hidden="true" /> Escenario base</span>
            {hasMsiScenario ? <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-dotted border-[var(--color-warning)]" aria-hidden="true" /> Con pagos MSI</span> : null}
          </Legend>
          <div className="h-[360px] w-full min-w-0" role="img" aria-label={ariaLabel}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={COLOR_GRID} strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={X_AXIS_HEIGHT}
                  tickMargin={8}
                  tick={AXIS_TICK}
                />
                <YAxis
                  width={Y_AXIS_WIDTH}
                  domain={balanceDomain}
                  tickCount={5}
                  tick={AXIS_TICK}
                  tickFormatter={formatAxisTick}
                />
                <ReferenceLine y={0} stroke={COLOR_ZERO_LINE} />
                <Tooltip
                  content={BalanceTooltip}
                  cursor={{ stroke: COLOR_ZERO_LINE, strokeWidth: 1 }}
                  wrapperStyle={{ outline: "none", pointerEvents: "none" }}
                />
                <Line
                  type="linear"
                  dataKey="base"
                  name="Escenario base"
                  stroke={COLOR_CREDIT}
                  strokeWidth={2.5}
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                  dot={{ r: 3, fill: COLOR_CREDIT, stroke: COLOR_CREDIT }}
                  activeDot={{ r: 5, fill: COLOR_CREDIT, stroke: COLOR_SURFACE_1, strokeWidth: 2 }}
                />
                {hasMsiScenario ? (
                  <Line
                    type="linear"
                    dataKey="msi"
                    name="Con pagos MSI"
                    stroke={COLOR_WARNING}
                    strokeWidth={2.5}
                    strokeDasharray="2 5"
                    strokeLinecap="round"
                    dot={{ r: 3, fill: COLOR_WARNING, stroke: COLOR_WARNING }}
                    activeDot={{ r: 5, fill: COLOR_WARNING, stroke: COLOR_SURFACE_1, strokeWidth: 2 }}
                  />
                ) : null}
                <Brush
                  dataKey="label"
                  height={BRUSH_HEIGHT}
                  travellerWidth={8}
                  stroke={COLOR_MUTED}
                  fill={COLOR_SURFACE_2}
                  startIndex={0}
                  endIndex={Math.max(data.length - 1, 0)}
                  ariaLabel="Rango de meses visible"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="text-xs text-muted">
            La línea empieza en el saldo real de Hoy. El escenario MSI solo aparece porque el payload aporta `msiPaymentScenarioBalance`; no se dibuja saldo histórico.
          </figcaption>
          <details className="app-panel rounded-[var(--radius-sm)] px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-primary focus-ring">Ver datos del gráfico</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">Datos de saldo de efectivo proyectado</caption>
                <thead className="text-secondary"><tr><th scope="col" className="px-2 py-2 text-left">Momento</th><th scope="col" className="px-2 py-2 text-right">Base</th>{hasMsiScenario ? <th scope="col" className="px-2 py-2 text-right">Con pagos MSI</th> : null}</tr></thead>
                <tbody>
                  {data.map((datum, index) => <tr key={`balance-row-${datum.month}-${index}`} className="border-default border-t"><td className="px-2 py-2 text-secondary">{periodLabel(datum.month)}</td><td className="px-2 py-2 text-right font-semibold tabular-nums text-primary">{formatAmount(datum.base)}</td>{hasMsiScenario ? <td className="px-2 py-2 text-right font-semibold tabular-nums text-primary">{formatValue(datum.msi)}</td> : null}</tr>)}
                </tbody>
              </table>
            </div>
          </details>
        </figure>
      )}
    </ProjectionPanel>
  );
}
