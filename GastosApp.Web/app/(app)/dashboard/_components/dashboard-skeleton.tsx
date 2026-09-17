type DashboardPanelSkeletonProps = {
  label: string;
  cards?: number;
  blocks?: number;
};

export function DashboardPanelSkeleton({ label, cards = 4, blocks = 2 }: DashboardPanelSkeletonProps) {
  return (
    <section className="grid gap-4" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-default bg-[var(--color-surface-1)]"
            aria-hidden="true"
          />
        ))}
      </div>
      {blocks > 0 ? (
        <div className="grid gap-4">
          {Array.from({ length: blocks }).map((_, index) => (
            <div
              key={index}
              className="h-72 animate-pulse rounded-2xl border border-default bg-[var(--color-surface-1)]"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
