import { ArrowDownRight, ArrowUpRight, CreditCard, TriangleAlert, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getBalanceToneClass } from "@/lib/accounts/metrics";
import { formatAmount } from "@/app/(app)/dashboard/_components/dashboard-format";

export type DashboardMetricCardItem = {
  title: string;
  /** `null` = dato ausente; nunca se muestra como $0. */
  amount: number | null;
  subtitle?: string;
  /** Advertencia breve sobre cómo leer la métrica. Se muestra como aviso, no como subtítulo. */
  note?: string;
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
    <section className={`grid gap-3 ${columns}`}>
        {items.map((item) => (
         <MetricCard key={item.title} {...item} />
       ))}
    </section>
  );
}

function MetricCard({ title, amount, subtitle, note, toneClass }: DashboardMetricCardItem) {
  const isIncome = /ingreso|suma/i.test(title);
  const isExpense = /gasto|resta|deuda|pendiente/i.test(title);
  const Icon = /crédito/i.test(title) ? CreditCard : /efectivo/i.test(title) ? Wallet : isIncome ? ArrowUpRight : isExpense ? ArrowDownRight : Wallet;
  const hasValue = amount !== null;
  const valueTone = !hasValue ? "text-muted" : toneClass ?? getBalanceToneClass(amount);

  return (
      <Card className="dashboard-card dashboard-card-interactive group relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-muted">{title}</p>
          {subtitle ? <p className="mt-1 text-[11px] font-medium text-muted">{subtitle}</p> : null}
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-4 truncate text-2xl font-semibold tabular-nums tracking-tight ${valueTone}`}>
        {hasValue ? formatAmount(amount) : "No disponible"}
      </p>
      {note ? (
        <p className="dashboard-metric-note m-0 mt-3 flex items-start gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] font-medium leading-snug text-secondary">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
          <span>{note}</span>
        </p>
      ) : null}
    </Card>
  );
}
