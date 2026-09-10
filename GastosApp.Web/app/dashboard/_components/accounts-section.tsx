import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Card } from "@/components/ui/card";
import { AccountCard } from "@/app/dashboard/_components/account-card";
import type { DashboardAccountOverview } from "@/lib/contracts/dashboard";
import type { DashboardViewMode } from "@/app/dashboard/_components/dashboard-view-mode";
import { cn } from "@/lib/ui/cn";

type AccountsSectionProps = {
  title: string;
  description: string;
  accounts: DashboardAccountOverview[];
  viewMode: DashboardViewMode;
  timezone: string;
  emptyMessage: string;
  defaultCollapsed?: boolean;
};

export function AccountsSection({
  title,
  description,
  accounts,
  viewMode,
  timezone,
  emptyMessage,
  defaultCollapsed = false
}: AccountsSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const sectionId = useId();
  const gridClass = viewMode === "detail" || viewMode === "headers"
    ? "grid-cols-1"
    : viewMode === "grid2"
      ? "sm:grid-cols-2"
      : "sm:grid-cols-2 xl:grid-cols-3";

  return (
    <Card className="overflow-hidden p-3 sm:p-4">
      <button
        type="button"
        onClick={() => setCollapsed((previous) => !previous)}
        className="mb-3 flex w-full items-start justify-between gap-2 text-left"
        aria-expanded={!collapsed}
        aria-controls={sectionId}
      >
        <div className="space-y-1">
           <h3 className="m-0 text-base font-semibold text-primary">{title}</h3>
           <p className="m-0 text-xs text-muted">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-default bg-[var(--color-surface-2)] px-3 py-1 text-xs font-semibold text-muted">
            {accounts.length} registradas
          </span>
          <span
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl border border-default bg-[var(--color-surface-2)] text-muted transition-transform",
              collapsed ? "rotate-0" : "rotate-180"
            )}
            aria-hidden="true"
          >
             <ChevronDown className="h-4 w-4" />
          </span>
        </div>
      </button>

      {collapsed ? null : (
        <div id={sectionId}>
          {accounts.length === 0 ? (
            <p className="m-0 rounded-xl border border-default bg-[var(--color-surface-2)] px-4 py-6 text-center text-sm text-muted">
              {emptyMessage}
            </p>
          ) : (
            <div className={cn("grid gap-3", gridClass)}>
              {accounts.map((account) => (
                <AccountCard key={account.accountId} account={account} viewMode={viewMode} timezone={timezone} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
