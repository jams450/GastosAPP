import type { BudgetUsageStatus } from "@/lib/contracts/budgets";
import { cn } from "@/lib/ui/cn";
import { formatPercent, reachedThresholdBadgeClass, THRESHOLD_BADGE_CLASS } from "../_lib/budgets-ui";

type Props = {
  thresholds: Array<{ thresholdId: number; name: string; percent: number; active: boolean }>;
  reachedThresholdId: number | null;
  status: BudgetUsageStatus;
};

export function BudgetThresholdChips({ thresholds, reachedThresholdId, status }: Props) {
  if (thresholds.length === 0) {
    return <span className="text-muted text-xs font-medium">Sin umbrales</span>;
  }

  return (
    <ul className="flex flex-wrap items-center gap-1" aria-label="Umbrales del presupuesto">
      {thresholds.map((threshold) => {
        const isReached = threshold.thresholdId === reachedThresholdId;
        return (
          <li key={threshold.thresholdId}>
            <span
              className={cn(
                isReached ? reachedThresholdBadgeClass(status) : THRESHOLD_BADGE_CLASS,
                !threshold.active && "line-through opacity-55"
              )}
              title={threshold.active ? undefined : "Umbral inactivo"}
            >
              {threshold.name} {formatPercent(threshold.percent)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
