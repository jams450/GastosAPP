import type { SortingState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";

type Props = {
  sorting: SortingState;
  labelsByColumnId: Record<string, string>;
  onClearSorting: () => void;
};

export function SortSummary({ sorting, labelsByColumnId, onClearSorting }: Props) {
  if (sorting.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted text-[11px] font-semibold uppercase tracking-wide">Orden</span>
      {sorting.map((item, index) => (
        <span
          key={`${item.id}-${index}`}
          className="input-semantic rounded-full px-2 py-0.5 text-[11px]"
        >
          {index + 1}. {labelsByColumnId[item.id] ?? item.id} {item.desc ? "↓" : "↑"}
        </span>
      ))}
      <Button type="button" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onClearSorting}>
        Reset orden
      </Button>
    </div>
  );
}
