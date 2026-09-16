import { LineChart } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { formatAmount, formatCompactAmount, formatMonthLabel } from "@/app/(app)/dashboard/_components/dashboard-format";
import type { DashboardProjectionMonth } from "@/lib/contracts/dashboard";

type ProjectionChartProps = {
  title: string;
  description: string;
  months: DashboardProjectionMonth[];
};

export function ProjectionChart({ title, description, months }: ProjectionChartProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setRevealed(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const values = months.flatMap((month) => [month.projectedCashBalance, month.msiPaymentScenarioBalance]);
  const hasData = months.length > 0 && values.some((value) => value !== 0);

  // Escala simétrica alrededor de cero: las barras crecen desde la línea de saldo 0.
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const zeroOffset = ((0 - min) / span) * 100;

  // El alto queda fijo; la entrada se anima con scaleY (GPU-safe) desde la línea de cero.
  const barStyle = (value: number) => {
    const magnitude = (Math.abs(value) / span) * 100;
    const reveal = { transform: revealed ? "scaleY(1)" : "scaleY(0)" };

    return value >= 0
      ? { bottom: `${zeroOffset}%`, height: `${magnitude}%`, transformOrigin: "bottom", ...reveal }
      : { top: `${100 - zeroOffset}%`, height: `${magnitude}%`, transformOrigin: "top", ...reveal };
  };

  return (
    <Card className="dashboard-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <LineChart className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="m-0 text-base font-semibold text-primary">{title}</h3>
          <p className="m-0 text-xs text-muted">{description}</p>
        </div>
      </div>

      {!hasData ? (
        <p className="app-panel m-0 border-dashed px-4 py-7 text-center text-sm text-muted">
          No hay datos de proyección para los próximos meses.
        </p>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted" aria-label="Series del escenario">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full dashboard-bar-accent" aria-hidden="true" />
              Saldo base de efectivo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full dashboard-bar-credit" aria-hidden="true" />
              Pagando MSI al vencimiento
            </span>
          </div>

          <div className="overflow-x-auto pb-1">
            <div
              className="grid auto-cols-[minmax(3.75rem,1fr)] grid-flow-col gap-2 sm:auto-cols-[minmax(4.5rem,1fr)] sm:gap-3"
              role="list"
              aria-label={`Saldo mensual proyectado para ${months.length} meses`}
            >
              {months.map((month) => (
                <div
                  key={month.month}
                  role="listitem"
                  className="grid gap-2"
                  title={`${formatMonthLabel(month.month)} · saldo base ${formatAmount(month.projectedCashBalance)} · pagando MSI al vencimiento ${formatAmount(month.msiPaymentScenarioBalance)} · compromiso MSI ${formatAmount(month.msiCommitment)}`}
                >
                  <div className="dashboard-track relative h-24 overflow-hidden rounded-[var(--radius-sm)] sm:h-32">
                    {min < 0 ? (
                      <div
                        className="absolute inset-x-0 border-t border-default"
                        style={{ bottom: `${zeroOffset}%` }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className="flex h-full items-stretch gap-1 px-1">
                      <div className="relative h-full flex-1">
                        <div
                          className="absolute inset-x-0 rounded-[var(--radius-sm)] dashboard-bar-accent transition-transform duration-500 ease-out motion-reduce:transition-none"
                          style={barStyle(month.projectedCashBalance)}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="relative h-full flex-1">
                        <div
                          className="absolute inset-x-0 rounded-[var(--radius-sm)] dashboard-bar-credit transition-transform duration-500 ease-out motion-reduce:transition-none"
                          style={barStyle(month.msiPaymentScenarioBalance)}
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </div>

                  <p className="m-0 text-center text-[11px] font-semibold text-muted">{formatMonthLabel(month.month)}</p>

                  <div className="grid gap-0.5 text-[11px] tabular-nums text-primary">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full dashboard-bar-accent" aria-hidden="true" />
                      <span className="truncate" title={formatAmount(month.projectedCashBalance)}>
                        {formatCompactAmount(month.projectedCashBalance)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full dashboard-bar-credit" aria-hidden="true" />
                      <span className="truncate" title={formatAmount(month.msiPaymentScenarioBalance)}>
                        {formatCompactAmount(month.msiPaymentScenarioBalance)}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
