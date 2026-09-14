import type { ReactNode } from "react";

type PageHeaderProps = {
  readonly section: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
};

export function PageHeader({ section, title, subtitle, meta, actions }: PageHeaderProps) {
  return <header className="shell-page-header flex flex-col items-start justify-between gap-4 p-4 sm:flex-row sm:items-center sm:p-5"><div className="min-w-0"><p className="text-muted text-[var(--type-shell-kicker)] font-semibold uppercase tracking-[0.16em]">{section}</p><h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-primary md:text-2xl">{title}</h1>{subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}</div><div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">{meta ? <div className="max-w-full">{meta}</div> : null}{actions}</div></header>;
}
