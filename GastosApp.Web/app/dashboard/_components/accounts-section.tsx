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
  emptyMessage: string;
  defaultCollapsed?: boolean;
};

export function AccountsSection({
  title,
  description,
  accounts,
  viewMode,
  emptyMessage,
  defaultCollapsed = false
}: AccountsSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const sectionId = useId();
  const gridClass = viewMode === "detail"
    ? "grid-cols-1"
    : viewMode === "grid2"
      ? "sm:grid-cols-2"
      : "sm:grid-cols-2 xl:grid-cols-3";

  return (
    <Card className="p-5">
      <button
        type="button"
        onClick={() => setCollapsed((previous) => !previous)}
        className="mb-4 flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={!collapsed}
        aria-controls={sectionId}
      >
        <div className="space-y-1">
          <h3 className="m-0 text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="m-0 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {accounts.length} registradas
          </span>
          <span
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 transition-transform dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
              collapsed ? "rotate-0" : "rotate-180"
            )}
            aria-hidden="true"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 8L10 13L15 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </button>

      {collapsed ? null : (
        <div id={sectionId}>
          {accounts.length === 0 ? (
            <p className="m-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {emptyMessage}
            </p>
          ) : (
            <div className={cn("grid gap-3", gridClass)}>
              {accounts.map((account) => (
                <AccountCard key={account.accountId} account={account} viewMode={viewMode} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
