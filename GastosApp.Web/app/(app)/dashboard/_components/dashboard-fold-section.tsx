import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/ui/cn";

type DashboardFoldSectionProps = {
  title: string;
  description: string;
  badge?: string;
  defaultCollapsed?: boolean;
  storageKey?: string;
  children: ReactNode;
};

export function DashboardFoldSection({
  title,
  description,
  badge,
  defaultCollapsed = true,
  storageKey,
  children
}: DashboardFoldSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hasOpened, setHasOpened] = useState(!defaultCollapsed);
  const sectionId = useId();

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(storageKey);
    if (stored === "open") {
      setCollapsed(false);
      setHasOpened(true);
    }

    if (stored === "closed") {
      setCollapsed(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!collapsed) {
      setHasOpened(true);
    }

    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, collapsed ? "closed" : "open");
    }
  }, [collapsed, storageKey]);

  return (
    <Card className="dashboard-card overflow-hidden p-3 sm:p-4" >
      <button
        type="button"
        onClick={() => setCollapsed((previous) => !previous)}
         className="dashboard-touch-target mb-3 flex w-full items-start justify-between gap-2 rounded-[var(--radius-sm)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]"
        aria-expanded={!collapsed}
        aria-controls={sectionId}
      >
        <div className="space-y-1">
           <h3 className="m-0 text-base font-semibold text-primary">{title}</h3>
           <p className="m-0 text-xs text-muted">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          {badge ? (
            <span className="rounded-full border border-default bg-[var(--color-surface-2)] px-3 py-1 text-xs font-semibold text-muted">
              {badge}
            </span>
          ) : null}
           <span className={cn("grid h-9 w-9 place-items-center rounded-xl border border-default bg-[var(--color-surface-2)] text-muted transition-transform", collapsed ? "rotate-0" : "rotate-180")} aria-hidden="true">
             <ChevronDown className="h-4 w-4" />
           </span>
        </div>
      </button>

      {collapsed ? null : <div id={sectionId}>{hasOpened ? children : null}</div>}
    </Card>
  );
}
