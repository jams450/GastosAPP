import type { ReactNode } from "react";

export type ActiveFilterValue = "all" | "active" | "inactive";

export type FilterChip = {
  id: string;
  label: string;
  onClear: () => void;
};

export type FilterSlot = {
  label: string;
  content: ReactNode;
};
