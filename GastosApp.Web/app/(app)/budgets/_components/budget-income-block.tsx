"use client";

import { AlertCircle, RotateCcw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentBudgetPeriod } from "@/lib/contracts/budgets";
import type { ExpectedInvestmentIncome } from "@/lib/contracts/investments";
import { formatCurrency } from "@/lib/format/currency";
import { budgetPeriodQueryValue } from "../_lib/budget-period";
import { clampPercent, formatPercent, formatPeriodLabel } from "../_lib/budgets-ui";
import type { PlanIncomeTotals } from "../_lib/plan-model";

type Props = {
  income: PlanIncomeTotals | null;
  expected: ExpectedInvestmentIncome | null;
  /** Falla secundaria de investments: el bloque se muestra igual, con rendimientos no disponibles. */
  expectedError: string | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  period: string;
  periodLabel: string;
};

/**
 * Bloque de ingresos del Resumen: presupuestado vs real del mes.
 *
 * Es una lectura **separada** del grid de límites de gasto: "Programado" nace de las partidas de
 * ingreso del mes (vienen de las programadas del catálogo), "Ejecutado" son las transacciones de
 * ingreso del mes, y los "Rendimientos esperados" son el interés mensual de la proyección de renta
 * fija como **supuesto explícito, nunca como ingreso real ni comprometido**.
 */
export function BudgetIncomeBlock({ income, expected, expectedError, loading, error, onRetry, period, periodLabel }: Props) {
  if (loading && income === null) {
    return <BudgetIncomeBlockSkeleton periodLabel={periodLabel} />;
  }

  if (error !== null || income === null) {
    return (
      <div className="border-[var(--color-danger)]/35 bg-[var(--color-danger)]/12 p-4 text-[var(--color-danger)]" role="alert" aria-live="assertive">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm font-bold">Error al cargar los ingresos</p>
            <p className="m-0 mt-1 text-xs font-medium">{error ?? "No se pudieron cargar los ingresos del periodo"}</p>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 h-8 border px-2.5 text-[11px] font-bold border-[var(--color-danger)]/50 bg-[var(--color-danger)]/15 hover:bg-[var(--color-danger)]/25"
              onClick={onRetry}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reintentar</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasExpectedPlan = expected !== null && expected.hasPlan;
  const isEmpty =
    income.plannedIncome === 0 &&
    income.committedIncome === 0 &&
    income.projectedIncome === 0 &&
    income.executedIncome === 0 &&
    !hasExpectedPlan;

  if (isEmpty) {
    return (
      <section aria-label={`Ingresos de ${periodLabel}`} className="app-panel flex flex-col items-center gap-3 border-dashed px-6 py-10 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <Wallet className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 className="m-0 text-base font-semibold text-primary">Sin ingresos programados este mes</h2>
          <p className="m-0 max-w-md text-sm text-muted">
            Cuando agregues partidas de ingreso desde <OriginLink />, aquí verás el programado frente al real.
          </p>
        </div>
      </section>
    );
  }

  const executionPercent = income.plannedIncome > 0 ? (income.executedIncome / income.plannedIncome) * 100 : 0;
  const executionWidth = clampPercent(executionPercent);
  const executionText =
    income.plannedIncome > 0
      ? `${formatPercent(executionPercent)} del ingreso programado ya se ejecutó`
      : "Sin ingreso programado este mes";
  const pendingExceeded = income.pendingIncome < 0;

  const params = new URLSearchParams({ tab: "partidas" });
  const periodQuery = budgetPeriodQueryValue(period, currentBudgetPeriod());
  if (periodQuery) {
    params.set("period", periodQuery);
  }

  return (
    <section aria-label={`Ingresos de ${periodLabel}`} className="dashboard-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Ingresos del periodo</h2>
          <p className="m-0 mt-1 text-[11px] font-medium text-muted">
            {periodLabel} · Partidas de ingreso del mes desde <OriginLink />
          </p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <Wallet className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <dl className="m-0 mt-4 space-y-2.5">
        <IncomeRow label="Programado" hint="Partidas de ingreso del mes" amount={income.plannedIncome} />
        <IncomeRow label="Comprometido" hint="Ingreso planificado aún no ejecutado" amount={income.committedIncome} />
        <IncomeRow label="Proyectado" hint="Promedios: estimación informativa" amount={income.projectedIncome} />
        <IncomeRow label="Ejecutado (real)" hint="Transacciones de ingreso del mes" amount={income.executedIncome} strong />
        <div className="flex items-baseline justify-between gap-3">
          <dt className="min-w-0">
            <p className="m-0 text-xs font-semibold text-primary">Pendiente</p>
            <p className="m-0 text-[11px] font-medium text-muted">
              {pendingExceeded
                ? `El ingreso real superó lo programado por ${formatCurrency(Math.abs(income.pendingIncome))}`
                : "Programado menos ejecutado"}
            </p>
          </dt>
          <dd className="m-0 shrink-0 text-sm font-bold tabular-nums text-primary">{formatCurrency(income.pendingIncome)}</dd>
        </div>
      </dl>

      <div
        className="dashboard-track mt-3 h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(executionWidth)}
        aria-valuetext={executionText}
        title={executionText}
      >
        <div
          className="h-full rounded-full bg-[var(--color-success)] transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${executionWidth}%` }}
        />
      </div>

      <div className="mt-3 border-t border-default pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="m-0 text-xs font-semibold text-primary">Rendimientos esperados</p>
          <p className="m-0 shrink-0 text-sm font-bold tabular-nums text-primary">
            {hasExpectedPlan && expected ? formatCurrency(expected.expectedInterest) : expectedError ? "No disponible" : "—"}
          </p>
        </div>
        <p className="m-0 mt-1 text-[11px] font-medium text-muted">
          {hasExpectedPlan && expected
            ? `${expected.allocationCount === 1 ? "1 asignación aporta" : `${expected.allocationCount} asignaciones aportan`} en ${formatPeriodLabel(expected.period)}. Proyección: supuesto, no es ingreso real.`
            : expectedError
              ? `${expectedError} Proyección: supuesto, no es ingreso real.`
              : "Sin plan de inversión vigente. Proyección: supuesto, no es ingreso real."}
        </p>
      </div>

      <p className="m-0 mt-3 text-[11px] font-medium text-muted">
        <a href={`/budgets?${params.toString()}`} className="focus-ring font-semibold text-[var(--color-accent)] underline">
          Ver partidas del mes
        </a>
        {" · "}Los rendimientos no se suman al ejecutado ni al comprometido.
      </p>
    </section>
  );
}

function IncomeRow({ label, hint, amount, strong = false }: { label: string; hint: string; amount: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0">
        <p className="m-0 text-xs font-semibold text-primary">{label}</p>
        <p className="m-0 text-[11px] font-medium text-muted">{hint}</p>
      </dt>
      <dd className={`m-0 shrink-0 tabular-nums text-primary ${strong ? "text-base font-bold" : "text-sm font-bold"}`}>
        {formatCurrency(amount)}
      </dd>
    </div>
  );
}

/** Origen de las cifras programadas: el catálogo de programadas, sin duplicar listados. */
function OriginLink() {
  return (
    <a href="/catalogs/recurring-items" className="focus-ring font-semibold text-[var(--color-accent)] underline">
      Programadas
    </a>
  );
}

export function BudgetIncomeBlockSkeleton({ periodLabel }: { periodLabel: string }) {
  return (
    <div className="dashboard-card animate-pulse p-4" role="status" aria-live="polite" aria-label={`Cargando ingresos de ${periodLabel}`}>
      <div className="h-2.5 w-36 rounded-none bg-[var(--color-surface-3)]" />
      <div className="mt-1 h-2 w-48 rounded-none bg-[var(--color-surface-3)]" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <div className="h-2.5 w-24 rounded-none bg-[var(--color-surface-3)]" />
            <div className="h-4 w-20 rounded-none bg-[var(--color-surface-3)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
