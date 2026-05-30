export const tableActionBaseClass = "h-8 border px-2 text-[11px] font-semibold";

export const tableActionStyles = {
  edit: "border-accent bg-[var(--color-accent-soft)] text-primary hover:border-accent hover:bg-[var(--color-accent-soft)]",
  deactivate: "border-amber-400/50 bg-amber-500/15 text-amber-200 hover:border-amber-300/70 hover:bg-amber-500/25",
  activate: "border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:border-emerald-300/70 hover:bg-emerald-500/25",
  delete: "border-[var(--color-danger)]/50 bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:border-[var(--color-danger)]/70 hover:bg-[var(--color-danger)]/25"
} as const;
