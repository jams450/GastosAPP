import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onCreate: () => void;
  createLabel?: string;
  children: ReactNode;
};

export function SectionCard({ title, count, expanded, onToggle, onCreate, createLabel = "Nuevo", children }: Props) {
  return (
    <Card className="p-2">
      <div
        className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/40"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block text-[11px] text-slate-500 transition-transform dark:text-slate-400 ${expanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            ▸
          </span>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">{count}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="h-6 px-1.5 text-[10px]"
            onClick={(event) => {
              event.stopPropagation();
              onCreate();
            }}
          >
            {createLabel}
          </Button>
        </div>
      </div>
      {expanded ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}
