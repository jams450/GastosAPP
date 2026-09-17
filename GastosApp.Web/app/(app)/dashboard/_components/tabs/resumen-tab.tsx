"use client";

import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { AccountsSection } from "@/app/(app)/dashboard/_components/accounts-section";
import { BreakdownChart } from "@/app/(app)/dashboard/_components/breakdown-chart";
import { DashboardMetricCards } from "@/app/(app)/dashboard/_components/dashboard-metric-cards";
import { DashboardPanelSkeleton } from "@/app/(app)/dashboard/_components/dashboard-skeleton";
import { formatAmount } from "@/app/(app)/dashboard/_components/dashboard-format";
import type { DashboardViewMode } from "@/app/(app)/dashboard/_components/dashboard-view-mode";
import { activeAccounts, byMonthlyActivity, sumClosingBalance, summarizeCredit } from "@/app/(app)/dashboard/_lib/dashboard-metrics";
import type { DashboardOverviewResponse } from "@/lib/contracts/dashboard";

type ResumenTabProps = {
  overview: DashboardOverviewResponse | null;
  loading: boolean;
  error: string | null;
  viewMode: DashboardViewMode;
  timezone: string;
};

export function ResumenTab({ overview, loading, error, viewMode, timezone }: ResumenTabProps) {
  if (loading) {
    return <DashboardPanelSkeleton label="Cargando resumen del mes" cards={5} blocks={2} />;
  }

  if (error || !overview) {
    return <Alert variant="danger">{error ?? "No se pudieron cargar los datos del dashboard"}</Alert>;
  }

  const credit = summarizeCredit(overview.accounts);
  const active = activeAccounts(overview.accounts);
  const activeCashAccounts = active.filter((account) => !account.isCredit);
  const cashTotal = sumClosingBalance(activeCashAccounts);
  const topAccounts = byMonthlyActivity(active).slice(0, 6);

  return (
    <div className="grid gap-4">
      <DashboardMetricCards
        items={[
          {
            title: "Ingresos del mes",
            subtitle: "Ingreso real + transferencias",
            amount: overview.generalSummary.monthIncome,
            toneClass: "dashboard-money-income"
          },
          {
            title: "Gastos del mes",
            subtitle: "Gastos reales + transferencias",
            amount: overview.generalSummary.monthExpense * -1,
            toneClass: "dashboard-money-expense"
          },
          {
            title: "Neto financiero",
            subtitle: "Ingresos menos gastos",
            amount: overview.generalSummary.monthFinancialNet,
            note: "No representa ahorro real; consulta Efectivo"
          },
          {
            title: "Efectivo disponible",
            subtitle: "Saldos de cuentas no-crédito activas",
            amount: cashTotal
          },
          {
            title: "Crédito disponible",
            subtitle: "Límite menos deuda pendiente",
            amount: credit.available,
            toneClass: "dashboard-money-credit"
          }
        ]}
        columns="sm:grid-cols-2 xl:grid-cols-3"
      />

      <FlowComparisonBars
        income={overview.generalSummary.monthIncome}
        expense={overview.generalSummary.monthExpense}
        net={overview.generalSummary.monthFinancialNet}
      />

      <section className="grid gap-4">
        <BreakdownChart
          title="Gastos por categoría"
          description="Top de egresos mensuales agrupados por categoría, dividido entre efectivo y crédito."
          showFundingSplit
          items={overview.charts.expenseByCategory}
          emptyMessage="No hay gastos del mes por categoría."
        />
        <BreakdownChart
          title="Gastos por subcategoría"
          description="Top de egresos mensuales agrupados por subcategoría, dividido entre efectivo y crédito."
          showFundingSplit
          items={overview.charts.expenseBySubcategory}
          emptyMessage="No hay gastos del mes por subcategoría."
        />
      </section>

      <AccountsSection
        title="Cuentas con mayor movimiento"
        description="Hasta seis cuentas activas ordenadas por movimiento del periodo."
        accounts={topAccounts}
        viewMode={viewMode}
        timezone={timezone}
        emptyMessage="No hay cuentas activas con movimiento en el periodo."
        collapsible={false}
      />
    </div>
  );
}

function FlowComparisonBars({ income, expense, net }: { income: number; expense: number; net: number }) {
  const maxValue = Math.max(Math.abs(income), Math.abs(expense), Math.abs(net), 0);
  const rows = [
    { label: "Ingresos", value: income, barClass: "dashboard-bar-income", textClass: "dashboard-money-income" },
    { label: "Gastos", value: expense, barClass: "dashboard-bar-expense", textClass: "dashboard-money-expense" },
    { label: "Neto", value: net, barClass: "dashboard-bar-accent", textClass: "text-primary" }
  ];

  return (
    <Card className="dashboard-card p-4 sm:p-5">
      <h3 className="m-0 text-base font-semibold text-primary">Ingresos vs gastos vs neto</h3>
      <p className="m-0 mb-4 mt-1 text-xs text-muted">Comparativo del mes seleccionado.</p>

      <ul className="m-0 grid list-none gap-3 p-0">
        {rows.map((row) => {
          const width = maxValue > 0 ? Math.min(Math.max((Math.abs(row.value) / maxValue) * 100, 4), 100) : 0;
          return (
            <li key={row.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">{row.label}</span>
              <span className="dashboard-track h-2.5 overflow-hidden rounded-full">
                <span className={`block h-full rounded-full ${row.barClass}`} style={{ width: `${width}%` }} />
              </span>
              <span className={`text-xs font-semibold tabular-nums ${row.textClass}`}>{formatAmount(row.value)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
