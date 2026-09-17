import type { BudgetUsageStatus } from "@/lib/contracts/budgets";
import { cn } from "@/lib/ui/cn";
import { budgetMeterClass, clampPercent, formatPercent } from "../_lib/budgets-ui";

type Props = {
  percentUsed: number;
  status: BudgetUsageStatus;
};

export function BudgetProgress({ percentUsed, status }: Props) {
  const width = clampPercent(percentUsed);

  return (
    <div
      className="dashboard-track h-1.5 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      aria-valuetext={`${formatPercent(percentUsed)} del límite`}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none", budgetMeterClass(status))}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
