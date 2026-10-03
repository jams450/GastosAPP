"use client";

import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { AccountsSection } from "@/app/(app)/dashboard/_components/accounts-section";
import { BreakdownChart } from "@/app/(app)/dashboard/_components/breakdown-chart";
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
  if (loading) return <DashboardPanelSkeleton label="Cargando resumen del mes" cards={5} blocks={2} />;
  if (error || !overview) return <Alert variant="danger">{error ?? "No se pudieron cargar los datos del dashboard"}</Alert>;

  const credit = summarizeCredit(overview.accounts);
  const active = activeAccounts(overview.accounts);
  const activeCashAccounts = active.filter((account) => !account.isCredit);
  const cashTotal = sumClosingBalance(activeCashAccounts);
  const topAccounts = byMonthlyActivity(active).slice(0, 6);
  return (
    <div className="grid gap-4">
      <div className="grid w-full gap-3 sm:grid-cols-3">
        <Card className="dashboard-card flex min-w-0 flex-col justify-center p-4">
          <p className="text-muted text-xs font-semibold">Neto financiero</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatAmount(overview.generalSummary.monthFinancialNet ?? 0)}</p>
          <p className="text-muted mt-1 text-xs">Ingresos menos gastos; no representa ahorro real.</p>
        </Card>
        <Card className="dashboard-card flex min-w-0 flex-col justify-center p-4">
          <p className="text-muted text-xs font-semibold">Efectivo</p>
          <p className="mt-1 text-2xl font-bold tabular-nums dashboard-money-income">{formatAmount(cashTotal)}</p>
        </Card>
        <Card className="dashboard-card flex min-w-0 flex-col justify-center p-4">
          <p className="text-muted text-xs font-semibold">Crédito disponible</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-purple-600 dark:text-purple-400">{formatAmount(credit.available ?? 0)}</p>
        </Card>
      </div>

      <Card className="dashboard-card grid w-full gap-4 p-5 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-muted text-xs font-semibold">Ingresos</p>
          <p className="mt-1 text-2xl font-bold tabular-nums dashboard-money-income">{formatAmount(overview.generalSummary.monthIncome)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-muted text-xs font-semibold">Gastos</p>
          <p className="mt-1 text-2xl font-bold tabular-nums dashboard-money-expense">{formatAmount(overview.generalSummary.monthExpense)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-muted text-xs font-semibold">Neto financiero</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatAmount(overview.generalSummary.monthFinancialNet ?? 0)}</p>
        </div>
      </Card>

      <section className="grid gap-4">
        <BreakdownChart title="Gastos por categoría" description="Top de egresos mensuales agrupados por categoría, dividido entre efectivo y crédito." showFundingSplit items={overview.charts.expenseByCategory} emptyMessage="No hay gastos del mes por categoría." />
        <BreakdownChart title="Gastos por subcategoría" description="Top de egresos mensuales agrupados por subcategoría, dividido entre efectivo y crédito." showFundingSplit items={overview.charts.expenseBySubcategory} emptyMessage="No hay gastos del mes por subcategoría." />
      </section>

      <AccountsSection title="Cuentas con mayor movimiento" description="Hasta seis cuentas activas ordenadas por movimiento del periodo." accounts={topAccounts} viewMode={viewMode} timezone={timezone} emptyMessage="No hay cuentas activas con movimiento en el periodo." collapsible={false} />
    </div>
  );
}
