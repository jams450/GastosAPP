"use client";

import { Alert } from "@/components/ui/alert";
import { AccountsSection } from "@/app/(app)/dashboard/_components/accounts-section";
import { CreditUtilizationList } from "@/app/(app)/dashboard/_components/credit-utilization-list";
import { DashboardMetricCards } from "@/app/(app)/dashboard/_components/dashboard-metric-cards";
import { DashboardPanelSkeleton } from "@/app/(app)/dashboard/_components/dashboard-skeleton";
import { MsiCommitmentsList } from "@/app/(app)/dashboard/_components/msi-commitments-list";
import type { DashboardViewMode } from "@/app/(app)/dashboard/_components/dashboard-view-mode";
import { activeAccounts, summarizeCredit } from "@/app/(app)/dashboard/_lib/dashboard-metrics";
import type { DashboardOverviewResponse, DashboardProjectionResponse } from "@/lib/contracts/dashboard";

type CreditoTabProps = {
  overview: DashboardOverviewResponse | null;
  loading: boolean;
  error: string | null;
  projection: DashboardProjectionResponse | null;
  projectionLoading: boolean;
  projectionError: string | null;
  viewMode: DashboardViewMode;
  timezone: string;
};

export function CreditoTab({
  overview,
  loading,
  error,
  projection,
  projectionLoading,
  projectionError,
  viewMode,
  timezone
}: CreditoTabProps) {
  if (loading) {
    return <DashboardPanelSkeleton label="Cargando cuentas de crédito" cards={5} blocks={2} />;
  }

  if (error || !overview) {
    return <Alert variant="danger">{error ?? "No se pudieron cargar los datos del dashboard"}</Alert>;
  }

  const creditAccounts = activeAccounts(overview.accounts).filter((account) => account.isCredit);
  const credit = summarizeCredit(overview.accounts);
  const msiPlans = projection?.msiPlans ?? [];

  return (
    <div className="grid gap-4">
      <DashboardMetricCards
        items={[
          {
            title: "Crédito disponible",
            subtitle: "Límite menos deuda pendiente (normal + MSI)",
            amount: credit.available,
            toneClass: "dashboard-money-credit"
          },
          {
            title: "Deuda normal pendiente",
            subtitle: "Saldo revolvente por pagar",
            amount: credit.pendingNormal,
            toneClass: "dashboard-money-expense"
          },
          {
            title: "Deuda MSI pendiente",
            subtitle: "Cuotas a meses sin intereses",
            amount: credit.pendingMsi,
            toneClass: "dashboard-money-expense"
          },
          {
            title: "Gasto normal del mes en curso",
            subtitle: "Cargos revolventes del mes actual",
            amount: overview.creditSummary.monthNormalExpense,
            toneClass: "dashboard-money-credit"
          },
          {
            title: "Gasto MSI del mes en curso",
            subtitle: "Cargos MSI del mes actual",
            amount: overview.creditSummary.monthMsiExpense,
            toneClass: "dashboard-money-credit"
          }
        ]}
        columns="sm:grid-cols-2 xl:grid-cols-3"
      />

      <CreditUtilizationList accounts={creditAccounts} emptyMessage="No hay tarjetas de crédito activas." />

      <AccountsSection
        title="Tarjetas de crédito"
        description="Corte, pago y comportamiento del periodo por cuenta."
        accounts={creditAccounts}
        viewMode={viewMode}
        timezone={timezone}
        emptyMessage="No hay tarjetas de crédito activas."
        collapsible={false}
      />

      {projectionLoading ? (
        <DashboardPanelSkeleton label="Cargando planes MSI" cards={0} blocks={1} />
      ) : projectionError ? (
        <Alert variant="danger">{projectionError}</Alert>
      ) : (
        <MsiCommitmentsList plans={msiPlans} timezone={timezone} />
      )}
    </div>
  );
}
