import { ArrowDownRight, ArrowUpRight, CreditCard, Wallet } from "lucide-react";
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
         <MetricCard key={item.title} {...item} />
       ))}
    </section>
  );
}

function MetricCard({ title, amount, subtitle, toneClass }: DashboardMetricCardItem) {
  const isIncome = /ingreso|suma/i.test(title);
  const isExpense = /gasto|resta|deuda|pendiente/i.test(title);
  const Icon = /crédito/i.test(title) ? CreditCard : /efectivo/i.test(title) ? Wallet : isIncome ? ArrowUpRight : isExpense ? ArrowDownRight : Wallet;

  return (
    <Card className="group relative overflow-hidden p-4 transition hover:-translate-y-0.5 hover:border-[var(--color-border-accent)] hover:shadow-[var(--shadow-md)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-muted">{title}</p>
          {subtitle ? <p className="mt-1 text-[11px] font-medium text-muted">{subtitle}</p> : null}
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-4 truncate text-2xl font-semibold tracking-tight ${toneClass ?? getBalanceToneClass(amount)}`}>{formatAmount(amount)}</p>
    </Card>
  );
}
