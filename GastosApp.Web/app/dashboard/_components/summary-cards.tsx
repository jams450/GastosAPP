import { DashboardMetricCards } from "@/app/dashboard/_components/dashboard-metric-cards";

type LegacyDashboardSummary = {
  cashTotal: number;
  creditUsed: number;
  totalDebt: number;
  creditDebtMsi: number;
  creditDebtNormal: number;
};

type SummaryCardsProps = {
  summary: LegacyDashboardSummary;
};

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <DashboardMetricCards
      columns="sm:grid-cols-2 lg:grid-cols-5"
      items={[
        { title: "Total efectivo", amount: summary.cashTotal },
        { title: "Total crédito", amount: summary.creditUsed },
        { title: "Gastos totales", amount: summary.totalDebt * -1 },
        { title: "Pendiente MSI", amount: summary.creditDebtMsi, toneClass: "text-indigo-700 dark:text-indigo-400" },
        { title: "Pendiente normal", amount: summary.creditDebtNormal, toneClass: "text-fuchsia-700 dark:text-fuchsia-400" }
      ]}
    />
  );
}
