import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { CatalogActionButton } from "./catalog-action-button";

type Props = {
  id: string;
  title: string;
  count: number;
  activeCount?: number;
  inactiveCount?: number;
  expanded: boolean;
  onToggle: () => void;
  onCreate: () => void;
  createLabel?: string;
  children: ReactNode;
};

export function SectionCard({
  id,
  title,
  count,
  activeCount,
  inactiveCount,
  expanded,
  onToggle,
  onCreate,
  createLabel = "Nuevo",
  children
}: Props) {
  return (
    <Card className="overflow-hidden p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={id}
        >
          <span
            className={`inline-block text-[11px] text-slate-500 transition-transform dark:text-slate-400 ${expanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            ▸
          </span>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{count}</span>
          {typeof activeCount === "number" ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 dark:border-emerald-900/80 dark:bg-emerald-900/30 dark:text-emerald-300">
              Activos {activeCount}
            </span>
          ) : null}
          {typeof inactiveCount === "number" ? (
            <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Inactivos {inactiveCount}
            </span>
          ) : null}
        </button>
        <div className="flex items-center gap-2">
          <CatalogActionButton action="create" type="button" className="h-7 px-2" onClick={onCreate} label={createLabel} />
        </div>
      </div>
      {expanded ? (
        <div id={id} className="mt-3 space-y-2">
          {children}
        </div>
      ) : null}
    </Card>
  );
}
