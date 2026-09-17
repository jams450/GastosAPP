"use client";

import { Alert } from "@/components/ui/alert";
import { AccountFlowBars } from "@/app/(app)/dashboard/_components/account-flow-bars";
import { AccountsSection } from "@/app/(app)/dashboard/_components/accounts-section";
import { DashboardMetricCards } from "@/app/(app)/dashboard/_components/dashboard-metric-cards";
import { DashboardPanelSkeleton } from "@/app/(app)/dashboard/_components/dashboard-skeleton";
import type { DashboardViewMode } from "@/app/(app)/dashboard/_components/dashboard-view-mode";
import { activeAccounts, sumClosingBalance } from "@/app/(app)/dashboard/_lib/dashboard-metrics";
import type { DashboardOverviewResponse } from "@/lib/contracts/dashboard";

type EfectivoTabProps = {
  overview: DashboardOverviewResponse | null;
  loading: boolean;
  error: string | null;
  viewMode: DashboardViewMode;
  timezone: string;
};

export function EfectivoTab({ overview, loading, error, viewMode, timezone }: EfectivoTabProps) {
  if (loading) {
    return <DashboardPanelSkeleton label="Cargando cuentas de efectivo" cards={4} blocks={2} />;
  }

  if (error || !overview) {
    return <Alert variant="danger">{error ?? "No se pudieron cargar los datos del dashboard"}</Alert>;
  }

  const cashAccounts = activeAccounts(overview.accounts).filter((account) => !account.isCredit);
  const cashTotal = sumClosingBalance(cashAccounts);

  return (
    <div className="grid gap-4">
      <DashboardMetricCards
        items={[
          { title: "Saldo total efectivo", subtitle: "Saldos de cuentas no-crédito activas", amount: cashTotal },
          {
            title: "Ingresos del mes",
            subtitle: "Flujo real de efectivo",
            amount: overview.cashSummary.monthIncome,
            toneClass: "dashboard-money-income"
          },
          {
            title: "Gastos del mes",
            subtitle: "Gasto real + efectivo→crédito",
            amount: overview.cashSummary.monthExpense * -1,
            toneClass: "dashboard-money-expense"
          },
          {
            title: "Neto mensual",
            subtitle: "Balance financiero del mes",
            amount: overview.cashSummary.monthFinancialNet
          }
        ]}
        columns="sm:grid-cols-2 xl:grid-cols-4"
      />

      <AccountFlowBars
        title="Ingresos vs gastos por cuenta"
        description="Comparativo mensual de movimiento real y transferencias entre cuentas de efectivo activas."
        accounts={cashAccounts}
        emptyMessage="No hay cuentas de efectivo activas."
      />

      <AccountsSection
        title="Cuentas de efectivo"
        description="Saldo de cierre y variación del mes por cuenta."
        accounts={cashAccounts}
        viewMode={viewMode}
        timezone={timezone}
        emptyMessage="No hay cuentas de efectivo activas."
        collapsible={false}
      />
    </div>
  );
}
