import type { ReactNode } from "react";
import { BarChart3, LineChart } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { AccountAnnualSummaryMonth } from "@/lib/contracts/account-annual-summary";
import { formatCurrency } from "@/lib/format/currency";
import {
  ANNUAL_CHART_BASELINE_Y,
  ANNUAL_CHART_HEIGHT,
  ANNUAL_CHART_PLOT_LEFT,
  ANNUAL_CHART_PLOT_RIGHT,
  ANNUAL_CHART_WIDTH,
  annualMonthX,
  buildAnnualBalanceChart,
  buildAnnualFlowChart,
  formatAnnualCompactMoney,
  formatAnnualMonthShort,
  type AnnualChartTick
} from "../_lib/accounts-annual-ui";

type Props = {
  months: AccountAnnualSummaryMonth[];
  year: number;
  caption: string;
};

function ChartPanel({ title, description, icon, children }: { title: string; description: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">{icon}</span>
        <div className="min-w-0 space-y-1">
          <h3 className="m-0 text-base font-semibold text-primary">{title}</h3>
          <p className="m-0 text-xs text-muted">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function Swatch({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${className}`} aria-hidden="true" />
      {children}
    </span>
  );
}

function ChartFrame({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto overscroll-x-contain pb-1" role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${ANNUAL_CHART_WIDTH} ${ANNUAL_CHART_HEIGHT}`} className="h-auto w-full min-w-[34rem]" role="presentation" aria-hidden="true">
        {children}
      </svg>
    </div>
  );
}

function AxisGrid({ ticks, showMonthLabels, months }: { ticks: AnnualChartTick[]; showMonthLabels: boolean; months: AccountAnnualSummaryMonth[] }) {
  return (
    <>
      {ticks.map((tick) => (
        <g key={`tick-${tick.value}`}>
          <line
            x1={ANNUAL_CHART_PLOT_LEFT}
            x2={ANNUAL_CHART_PLOT_RIGHT}
            y1={tick.y}
            y2={tick.y}
            stroke="var(--color-border)"
            strokeWidth={1}
            strokeDasharray={tick.value === 0 ? undefined : "4 4"}
          />
          <text x={ANNUAL_CHART_PLOT_LEFT - 8} y={tick.y + 3} textAnchor="end" fontSize={10} fill="var(--color-text-muted)">
            {tick.label}
          </text>
        </g>
      ))}
      {showMonthLabels
        ? months.map((month) => (
            <text key={`month-${month.month}`} x={annualMonthX(month.month)} y={ANNUAL_CHART_BASELINE_Y + 20} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)">
              {formatAnnualMonthShort(month.month)}
            </text>
          ))
        : null}
    </>
  );
}

export function AnnualFlowBars({ months, year, caption }: Props) {
  const model = buildAnnualFlowChart(months);

  return (
    <ChartPanel
      title="Ingresos contra gastos"
      description={`Comparación mes a mes de ${year}. Las transferencias se excluyen: solo mueven saldo entre tus cuentas.`}
      icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
    >
      {!model.hasData ? (
        <p className="app-panel m-0 border-dashed px-4 py-7 text-center text-sm text-muted">Sin ingresos ni gastos registrados en {year}.</p>
      ) : (
        <figure className="m-0 grid gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted" aria-label="Leyenda del gráfico">
            <Swatch className="dashboard-bar-income">Ingresos</Swatch>
            <Swatch className="dashboard-bar-expense">Gastos</Swatch>
          </div>
          <ChartFrame ariaLabel={`Ingresos y gastos de cada mes de ${year}. Pico anual ${formatAnnualCompactMoney(model.peak)}.`}>
            <AxisGrid ticks={model.ticks} showMonthLabels months={months} />
            {model.bars.map((bar) => (
              <g key={`bar-${bar.month}`}>
                {bar.incomeHeight > 0 ? (
                  <rect x={bar.incomeX} y={bar.incomeY} width={bar.width} height={bar.incomeHeight} rx={2} fill="var(--color-success)" opacity={0.85}>
                    <title>{`${bar.label} · ingresos ${formatCurrency(bar.income)}`}</title>
                  </rect>
                ) : null}
                {bar.expenseHeight > 0 ? (
                  <rect x={bar.expenseX} y={bar.expenseY} width={bar.width} height={bar.expenseHeight} rx={2} fill="var(--color-danger)" opacity={0.85}>
                    <title>{`${bar.label} · gastos ${formatCurrency(bar.expense)}`}</title>
                  </rect>
                ) : null}
              </g>
            ))}
          </ChartFrame>
          <figcaption className="text-xs text-muted">{caption}</figcaption>
        </figure>
      )}
    </ChartPanel>
  );
}

export function AnnualBalanceLine({ months, year, caption }: Props) {
  const model = buildAnnualBalanceChart(months);

  return (
    <ChartPanel
      title="Saldo al cierre de cada mes"
      description={`Saldo de la cuenta al terminar cada mes de ${year}. Incluye el arrastre de los meses sin movimientos.`}
      icon={<LineChart className="h-4 w-4" aria-hidden="true" />}
    >
      {!model ? (
        <p className="app-panel m-0 border-dashed px-4 py-7 text-center text-sm text-muted">No hay meses que mostrar para {year}.</p>
      ) : (
        <figure className="m-0 grid gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted" aria-label="Leyenda del gráfico">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-6 border-t-2 border-[var(--color-credit)]" aria-hidden="true" />
              Saldo al cierre
            </span>
          </div>
          <ChartFrame ariaLabel={`Saldo de cierre mensual de ${year}: ${formatAnnualCompactMoney(model.points[0].value)} en ${model.points[0].label} y ${formatAnnualCompactMoney(model.finalValue)} al cierre del año.`}>
            <AxisGrid ticks={model.ticks} showMonthLabels months={months} />
            {model.zeroY !== null ? (
              <line x1={ANNUAL_CHART_PLOT_LEFT} x2={ANNUAL_CHART_PLOT_RIGHT} y1={model.zeroY} y2={model.zeroY} stroke="var(--color-border-strong)" strokeWidth={1} />
            ) : null}
            <path d={model.areaPath} fill="var(--color-credit)" opacity={0.12} />
            <polyline points={model.polyline} fill="none" stroke="var(--color-credit)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {model.points.map((point) => (
              <circle key={`point-${point.month}`} cx={point.x} cy={point.y} r={3} fill="var(--color-credit)">
                <title>{`${point.label} · saldo al cierre ${formatCurrency(point.value)}`}</title>
              </circle>
            ))}
          </ChartFrame>
          <figcaption className="text-xs text-muted">{caption}</figcaption>
        </figure>
      )}
    </ChartPanel>
  );
}
