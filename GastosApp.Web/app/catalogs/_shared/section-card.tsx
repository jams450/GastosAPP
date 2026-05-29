import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/ui/cn";
import { CatalogActionButton } from "./catalog-action-button";

type Props = {
  id: string;
  title: string;
  count?: number;
  activeCount?: number;
  inactiveCount?: number;
  expanded: boolean;
  onToggle: () => void;
  onCreate: () => void;
  createLabel?: string;
  hideCreateButton?: boolean;
  hideHeaderBar?: boolean;
  transparentBody?: boolean;
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
  hideCreateButton = false,
  hideHeaderBar = false,
  transparentBody = false,
  children
}: Props) {
  const showHeader = !hideHeaderBar;

  return (
    <Card className={cn("overflow-hidden rounded-none border-zinc-800 bg-zinc-950 p-2.5", transparentBody && "border-transparent bg-transparent p-0")}>
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 px-0.5 py-1 text-left"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={id}
          >
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-zinc-100">{title}</h2>
              {typeof count === "number" ? (
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                  <span>Total: <span className="font-semibold text-zinc-200">{count}</span></span>
                  {typeof activeCount === "number" ? (
                    <span>Activos: <span className="font-semibold text-zinc-200">{activeCount}</span></span>
                  ) : null}
                  {typeof inactiveCount === "number" ? (
                    <span>Inactivos: <span className="font-semibold text-zinc-200">{inactiveCount}</span></span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </button>
          {!hideCreateButton ? (
            <div className="flex items-center gap-2">
              <CatalogActionButton
                action="create"
                type="button"
                className="h-8 rounded-md px-3 text-xs font-bold"
                onClick={onCreate}
                label={createLabel}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {expanded ? (
        <div id={id} className={cn("mt-3 space-y-2", hideHeaderBar && "mt-0 space-y-0")}>
          {children}
        </div>
      ) : null}
    </Card>
  );
}
