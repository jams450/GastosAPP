"use client";

import { CalendarDays, Coins, TrendingUp, Wallet } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/currency";
import { formatCompactAmount, formatDate, formatMonthLabel } from "@/app/(app)/dashboard/_components/dashboard-format";
import type { InvestmentPlan } from "@/lib/contracts/investments";
import type { DashboardProjection } from "../_lib/investment-dashboard";

export const projectionValue = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? "—" : formatCurrency(value);

export function InvestmentDashboard({ plan, dashboard, horizon, loading }: { plan: InvestmentPlan | null; dashboard: DashboardProjection; horizon: number; loading: boolean }) {
  const month = plan?.planMonth;
  const items = [
    { label: "Total invertido", value: dashboard.starting, note: month ? `Capital inicial congelado del plan de ${formatMonthLabel(month)}` : "Sin plan generado", Icon: Wallet },
    { label: "Proyectado al cierre del mes", value: dashboard.monthEnd, note: month ? formatMonthLabel(month) : "Mes del plan", Icon: Coins },
    { label: "Proyectado al cierre del año", value: dashboard.yearEnd, note: month ? `Diciembre de ${month.slice(0, 4)}` : "Año del plan", Icon: CalendarDays },
    { label: "Proyectado al cierre de 12 meses", value: dashboard.twelveMonthEnd, note: "Punto mensual 12 desde el mes del plan", Icon: TrendingUp }
  ];
  const missing = loading ? "Cargando el plan…" : !plan?.isPersisted ? "Genera el plan para consultar sus proyecciones. Un borrador no es capital invertido ni un rendimiento real." : !plan.allocations.length ? "El plan no tiene capital asignado a productos elegibles." : "— indica que la proyección de la API aún no está disponible o no coincide con la instantánea. No se calculan cierres hasta recibir una serie válida.";
  return (
    <div className="space-y-4" aria-busy={loading}>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores del plan de inversión">
        {items.map(({ label, value, note, Icon }) => (
          <Card key={label} className="dashboard-card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="m-0 text-xs font-semibold text-muted">{label}</p>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]"><Icon className="h-4 w-4" aria-hidden="true" /></span>
            </div>
            <p className="mt-4 break-words text-2xl font-semibold tabular-nums tracking-tight text-primary">{projectionValue(value)}</p>
            <p className="mt-2 text-xs text-muted">{note}</p>
          </Card>
        ))}
      </section>
      <p className="text-xs text-muted">{items.some((item) => item.value === null) ? missing : "Instantánea al generar el plan, no saldos actuales en tiempo real. Los cierres son estimaciones, no ganancias realizadas."}</p>
      <Card className="dashboard-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="m-0 text-base font-semibold text-primary">Evolución estimada del capital</h2>
            <p className="mt-1 text-xs text-muted">Interés compuesto marginal con los mismos tramos verificados del plan y capital inicial, sin nuevos depósitos.</p>
          </div>
          <span className="text-xs text-muted">{horizon} {horizon === 1 ? "mes" : "meses"}</span>
        </div>
        {dashboard.points.length ? (
          <>
            <div className="mb-3 flex flex-wrap justify-between gap-2 text-xs text-secondary">
              <span>Inicio: {formatDate(dashboard.points[0].date, "UTC")}</span>
              <span>Fin: {formatDate(dashboard.points.at(-1)!.date, "UTC")}</span>
            </div>
            <p className="mb-3 flex items-center gap-2 text-xs text-secondary"><span className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" aria-hidden="true" />Capital estimado (MXN)</p>
            <div className="h-[320px] min-w-0" role="img" aria-label="Capital inicial y cierres mensuales estimados. Consulta la tabla de datos debajo del gráfico.">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard.points} margin={{ top: 12, right: 12, bottom: 12, left: 4 }} accessibilityLayer>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(value: string) => formatDate(value, "UTC")} tick={{ fill: "var(--color-text-muted)", fontSize: 10 }} minTickGap={28} />
                  <YAxis domain={["auto", "auto"]} tickFormatter={formatCompactAmount} width={80} tick={{ fill: "var(--color-text-muted)", fontSize: 10 }} />
                  <Tooltip labelFormatter={(value) => typeof value === "string" ? formatDate(value, "UTC") : ""} formatter={(value) => [projectionValue(typeof value === "number" ? value : null), "Capital estimado (MXN)"]} contentStyle={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }} />
                  <Line type="linear" dataKey="capital" name="Capital estimado (MXN)" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {dashboard.points.some((point) => point.capital === null) ? <p className="my-2 text-xs text-muted">Faltan tramos verificados o datos consistentes. Los puntos ausentes no se dibujan como cero.</p> : null}
            <details className="mt-3 border-t border-default pt-3">
              <summary className="focus-ring cursor-pointer text-sm font-semibold text-primary">Ver datos de la proyección</summary>
              <div className="mt-3 overflow-x-auto focus-ring" tabIndex={0} role="region" aria-label="Datos numéricos de la proyección">
                <table className="w-full min-w-[420px] text-sm">
                  <caption className="sr-only">Capital inicial y todos los cierres del periodo en pesos mexicanos</caption>
                  <thead><tr className="border-b border-default"><th scope="col" className="p-2 text-left">Fecha</th><th scope="col" className="p-2 text-right">Interés del mes</th><th scope="col" className="p-2 text-right">Capital estimado</th></tr></thead>
                  <tbody>{dashboard.points.map((point) => <tr key={point.date} className="border-b border-default"><th scope="row" className="p-2 text-left font-normal">{formatDate(point.date, "UTC")}{point.monthNumber === 0 ? " · Inicio" : " · Cierre"}</th><td className="p-2 text-right tabular-nums">{projectionValue(point.interest)}</td><td className="p-2 text-right font-semibold tabular-nums">{projectionValue(point.capital)}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          </>
        ) : <p className="py-8 text-center text-sm text-muted">{missing}</p>}
      </Card>
    </div>
  );
}
