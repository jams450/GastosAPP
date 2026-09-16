import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

type PageHeaderProps = {
  readonly section: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
  /** "card" is the layered shell header; "plain" is a flat, square, edge-aligned bar. */
  readonly variant?: "card" | "plain";
};

export function PageHeader({ section, title, subtitle, meta, actions, variant = "card" }: PageHeaderProps) {
  const isPlain = variant === "plain";

  return (
    <header
      className={cn(
        "relative flex flex-col items-start justify-between gap-4",
        isPlain
          ? "shell-page-header-plain pb-3 pt-1 sm:flex-row sm:items-end"
          : "shell-page-header overflow-hidden p-4 sm:flex-row sm:items-center sm:p-5"
      )}
    >
      {isPlain ? null : (
        <span className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-[var(--color-shell-glow)] opacity-30 blur-3xl" aria-hidden="true" />
      )}
      <div className="relative min-w-0">
        <p className="shell-page-kicker">{section}</p>
        <h1 className="mt-1 min-w-0 break-words text-xl font-semibold tracking-tight text-primary md:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {meta || actions ? (
        <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
          {meta ? <div className="max-w-full">{meta}</div> : null}
          {actions}
        </div>
      ) : null}
    </header>
  );
}
