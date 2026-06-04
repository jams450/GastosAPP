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
    <Card className="rounded-2xl border border-indigo-200/50 bg-indigo-50/25 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/15">
      <button
        type="button"
        onClick={() => setCollapsed((previous) => !previous)}
        className="mb-3 flex w-full items-start justify-between gap-2 text-left"
        aria-expanded={!collapsed}
        aria-controls={sectionId}
      >
        <div className="space-y-1">
          <h3 className="m-0 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="m-0 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          {badge ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {badge}
            </span>
          ) : null}
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

      {collapsed ? null : <div id={sectionId}>{hasOpened ? children : null}</div>}
    </Card>
  );
}
