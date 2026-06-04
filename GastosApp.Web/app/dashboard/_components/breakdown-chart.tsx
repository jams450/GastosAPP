import { Card } from "@/components/ui/card";
import { formatAmount } from "@/app/dashboard/_components/dashboard-format";
import type { DashboardBreakdownItem } from "@/lib/contracts/dashboard";

type BreakdownChartProps = {
  title: string;
  description: string;
  items: DashboardBreakdownItem[];
  emptyMessage: string;
  tone?: "rose" | "sky" | "emerald" | "violet";
};

const toneClasses: Record<NonNullable<BreakdownChartProps["tone"]>, string> = {
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500"
};

export function BreakdownChart({
  title,
  description,
  items,
  emptyMessage,
  tone = "sky"
}: BreakdownChartProps) {
  const maxAmount = items.reduce((max, item) => Math.max(max, Math.abs(item.amount)), 0);
  const totalAmount = items.reduce((sum, item) => sum + Math.abs(item.amount), 0);

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 space-y-1">
        <h3 className="m-0 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="m-0 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>

      {items.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          {emptyMessage}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const width = maxAmount > 0 ? Math.max((Math.abs(item.amount) / maxAmount) * 100, 6) : 0;
            const percentage = totalAmount > 0 ? (Math.abs(item.amount) / totalAmount) * 100 : 0;
            return (
              <div key={`${item.id ?? "none"}-${item.name}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-slate-700 dark:text-slate-200" title={item.name}>{item.name}</span>
                  <div className="flex shrink-0 items-center gap-2 text-right">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{percentage.toFixed(1)}%</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{formatAmount(item.amount)}</span>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`h-full rounded-full ${toneClasses[tone]}`} style={{ width: `${width}%` }} aria-hidden="true" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
