import { Card } from "@/components/ui/card";
import { getBalanceToneClass } from "@/lib/accounts/metrics";
import { formatAmount } from "@/app/dashboard/_components/dashboard-format";

export type DashboardMetricCardItem = {
  title: string;
  amount: number;
  subtitle?: string;
  toneClass?: string;
};

type DashboardMetricCardsProps = {
  items: DashboardMetricCardItem[];
  columns?: string;
};

export function DashboardMetricCards({
  items,
  columns = "sm:grid-cols-2 xl:grid-cols-4"
}: DashboardMetricCardsProps) {
  return (
    <section className={`grid gap-2 ${columns}`}>
      {items.map((item) => (
        <MetricCard key={item.title} title={item.title} amount={item.amount} toneClass={item.toneClass} />
      ))}
    </section>
  );
}

function MetricCard({ title, amount, subtitle, toneClass }: DashboardMetricCardItem) {
  return (
    <Card className="rounded-2xl border border-blue-200/55 bg-blue-50/35 p-3 dark:border-blue-900/45 dark:bg-blue-950/20">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      {subtitle ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{subtitle}</p> : null}
      <p className={`mt-1 text-xl font-semibold ${toneClass ?? getBalanceToneClass(amount)}`}>{formatAmount(amount)}</p>
    </Card>
  );
}
