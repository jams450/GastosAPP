import { Card } from "@/components/ui/card";
import type { DashboardSummary } from "@/lib/contracts/dashboard";
import { getBalanceToneClass } from "@/lib/accounts/metrics";
import { formatAmount } from "@/app/dashboard/_components/dashboard-format";

type SummaryCardsProps = {
  summary: DashboardSummary;
};

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <MetricCard title="Total efectivo" amount={summary.cashTotal} />
      <MetricCard title="Total crédito" amount={summary.creditUsed} />
      <MetricCard title="Gastos totales" amount={summary.totalDebt * -1} />
      <MetricCard title="Pendiente MSI" amount={summary.creditDebtMsi} toneClass="text-indigo-700 dark:text-indigo-400" />
      <MetricCard title="Pendiente normal" amount={summary.creditDebtNormal} toneClass="text-fuchsia-700 dark:text-fuchsia-400" />
    </section>
  );
}

function MetricCard({ title, amount, toneClass }: { title: string; amount: number; toneClass?: string }) {
  return (
    <Card className="rounded-2xl p-4">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass ?? getBalanceToneClass(amount)}`}>{formatAmount(amount)}</p>
    </Card>
  );
}
