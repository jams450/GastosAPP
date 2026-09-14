export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full border border-[var(--color-success)]/35 bg-[var(--color-success)]/14 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]"
          : "rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-3)] px-2 py-0.5 text-[10px] font-semibold text-muted"
      }
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}
