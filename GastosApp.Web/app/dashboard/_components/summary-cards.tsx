import { Card } from "@/components/ui/card";
import type { DashboardSummary } from "@/lib/contracts/dashboard";
import { getBalanceToneClass } from "@/lib/accounts/metrics";
import { formatAmount } from "@/app/dashboard/_components/dashboard-format";

type SummaryCardsProps = {
  summary: DashboardSummary;
};

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <MetricCard title="Total efectivo" amount={summary.cashTotal} />
      <MetricCard title="Total crédito" amount={summary.creditUsed} />
      <MetricCard title="Gastos totales" amount={summary.totalDebt * -1} />
    </section>
  );
}

function MetricCard({ title, amount }: { title: string; amount: number }) {
  return (
    <Card className="rounded-2xl p-4">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      <p className={`mt-2 text-2xl font-semibold ${getBalanceToneClass(amount)}`}>{formatAmount(amount)}</p>
    </Card>
  );
}
