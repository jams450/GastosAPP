import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatAmount } from "@/app/dashboard/_components/dashboard-format";
import type { DashboardBreakdownItem } from "@/lib/contracts/dashboard";

type BreakdownChartProps = {
  title: string;
  description: string;
  items: DashboardBreakdownItem[];
  emptyMessage: string;
  tone?: "rose" | "sky" | "emerald" | "violet";
  showFundingSplit?: boolean;
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
  tone = "sky",
  showFundingSplit = false
}: BreakdownChartProps) {
  const maxAmount = items.reduce((max, item) => Math.max(max, Math.abs(item.amount)), 0);
  const totalAmount = items.reduce((sum, item) => sum + Math.abs(item.amount), 0);

  return (
    <Card className="p-4 sm:p-5">
       <div className="mb-5 flex items-start gap-3">
         <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]"><BarChart3 className="h-4 w-4" aria-hidden="true" /></span>
         <div className="min-w-0 space-y-1">
           <h3 className="m-0 text-base font-semibold text-primary">{title}</h3>
           <p className="m-0 text-xs text-muted">{description}</p>
         </div>
      </div>

       {items.length === 0 ? (
            <p className="app-panel m-0 border-dashed px-4 py-7 text-center text-sm text-muted">
           {emptyMessage}
         </p>
       ) : (
         <>
           {showFundingSplit ? (
             <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted" aria-label="Distribución por forma de pago">
               <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />Efectivo</span>
               <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" aria-hidden="true" />Crédito</span>
             </div>
           ) : null}
           <div className="space-y-3">
           {items.map((item) => {
             const width = maxAmount > 0 ? Math.min(Math.max((Math.abs(item.amount) / maxAmount) * 100, 6), 100) : 0;
            const percentage = totalAmount > 0 ? (Math.abs(item.amount) / totalAmount) * 100 : 0;
              const fundingTotal = Math.abs(item.cashAmount) + Math.abs(item.creditAmount);
              const cashWidth = fundingTotal > 0 ? width * (Math.abs(item.cashAmount) / fundingTotal) : 0;
              const creditWidth = fundingTotal > 0 ? width * (Math.abs(item.creditAmount) / fundingTotal) : 0;
             return (
               <div key={`${item.id ?? "none"}-${item.name}`} className="space-y-1.5">
                 <div className="flex items-center justify-between gap-3 text-sm">
                   <span className="truncate font-medium text-slate-700 dark:text-slate-200" title={item.name}>{item.name}</span>
                   <div className="flex shrink-0 items-center gap-2 text-right">
                     <span className="text-xs text-slate-500 dark:text-slate-400">{percentage.toFixed(1)}%</span>
                     <span className="font-semibold text-slate-900 dark:text-slate-100">{formatAmount(item.amount)}</span>
                   </div>
                 </div>
                 {showFundingSplit ? (
                   <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`${item.name}: efectivo ${formatAmount(item.cashAmount)}, crédito ${formatAmount(item.creditAmount)}`}>
                     <div className="flex h-full" aria-hidden="true">
                       <div className="h-full bg-emerald-500" style={{ width: `${cashWidth}%` }} />
                       <div className="h-full bg-violet-500" style={{ width: `${creditWidth}%` }} />
                     </div>
                   </div>
                 ) : (
                   <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                     <div className={`h-full rounded-full ${toneClasses[tone]}`} style={{ width: `${width}%` }} aria-hidden="true" />
                   </div>
                 )}
                 {showFundingSplit && (item.cashAmount !== 0 || item.creditAmount !== 0) ? (
                   <div className="flex flex-wrap gap-x-3 text-xs text-muted">
                     {item.cashAmount !== 0 ? <span>Efectivo: {formatAmount(item.cashAmount)}</span> : null}
                     {item.creditAmount !== 0 ? <span>Crédito: {formatAmount(item.creditAmount)}</span> : null}
                   </div>
                 ) : null}
               </div>
             );
           })}
         </div>
         </>
       )}
    </Card>
  );
}
