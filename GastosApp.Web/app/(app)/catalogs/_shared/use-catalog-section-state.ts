import type { SortingState } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { ActiveFilterValue } from "./catalog-section-types";

type UseCatalogSectionStateArgs<T> = {
  rows: T[];
  initialSorting: SortingState;
  searchPredicate: (row: T, normalizedQuery: string) => boolean;
  activePredicate: (row: T) => boolean;
  extraFilterPredicate?: (row: T) => boolean;
};

export function useCatalogSectionState<T>({
  rows,
  initialSorting,
  searchPredicate,
  activePredicate,
  extraFilterPredicate
}: UseCatalogSectionStateArgs<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilterValue>("all");
  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (activeFilter === "active" && !activePredicate(row)) {
        return false;
      }

      if (activeFilter === "inactive" && activePredicate(row)) {
        return false;
      }

      if (normalizedQuery && !searchPredicate(row, normalizedQuery)) {
        return false;
      }

      if (extraFilterPredicate && !extraFilterPredicate(row)) {
        return false;
      }

      return true;
    });
  }, [activeFilter, activePredicate, extraFilterPredicate, normalizedQuery, rows, searchPredicate]);

  function clearFilters() {
    setSearchQuery("");
    setActiveFilter("all");
  }

  function clearSorting() {
    setSorting(initialSorting);
  }

  return {
    filteredRows,
    searchQuery,
    setSearchQuery,
    activeFilter,
    setActiveFilter,
    sorting,
    setSorting,
    clearFilters,
    clearSorting
  };
}
