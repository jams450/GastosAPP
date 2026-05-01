import { useCallback, useMemo, useState } from "react";
import type { Category } from "@/lib/contracts/categories";
import type { CatalogsResponse, HistoryFilters, TransactionHistoryItem, TransactionKind, TransactionListResponse, TransferGroupItem } from "../_lib/transactions-types";

type Params = {
  catalogs: CatalogsResponse | null;
  historyMonth: string;
};

export function useTransactionsHistory({ catalogs, historyMonth }: Params) {
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<TransactionHistoryItem[]>([]);
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>({
    type: "all",
    accountId: "all",
    categoryId: "all"
  });

  const regularHistoryItems = useMemo(() => historyItems.filter((item) => item.type !== "transfer"), [historyItems]);

  const transferGroups = useMemo<TransferGroupItem[]>(() => {
    const grouped = new Map<string, TransactionHistoryItem[]>();

    historyItems
      .filter((item) => item.type === "transfer" && item.transferGroupId)
      .forEach((item) => {
        const key = item.transferGroupId as string;
        const current = grouped.get(key) ?? [];
        current.push(item);
        grouped.set(key, current);
      });

    return Array.from(grouped.entries())
      .map(([transferGroupId, items]) => {
        const ordered = [...items].sort((a, b) => a.transactionId - b.transactionId);
        const first = ordered[0];
        const second = ordered[1];

        const mergedTags = [...new Set(ordered.flatMap((item) => item.tags))];

        return {
          transferGroupId,
          destinationTransactionId: second?.transactionId ?? null,
          transactionDate: first.transactionDate,
          amount: first.amount,
          sourceAccountId: first.accountId,
          destinationAccountId: second?.accountId ?? null,
          accountFromName: first.accountName,
          accountToName: second?.accountName ?? "—",
          categoryId: first.categoryId,
          subcategoryId: first.subcategoryId,
          merchantId: first.merchantId,
          description: first.description,
          tags: mergedTags
        };
      })
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  }, [historyItems]);

  const historyAccountOptions = useMemo(
    () => (catalogs?.accounts ?? []).map((account) => ({ value: account.accountId, label: account.name })),
    [catalogs]
  );

  const historyCategoryOptions = useMemo(() => {
    if (!catalogs) return [] as { value: number; label: string }[];
    const source: Category[] = historyFilters.type === "all" ? catalogs.categories : catalogs.categoriesByType[historyFilters.type] ?? [];
    return source.map((category) => ({ value: category.categoryId, label: category.name }));
  }, [catalogs, historyFilters.type]);

  const filteredRegularHistoryItems = useMemo(() => {
    return regularHistoryItems.filter((item) => {
      if (historyFilters.type !== "all" && item.type !== historyFilters.type) return false;
      if (historyFilters.accountId !== "all" && item.accountId !== historyFilters.accountId) return false;
      if (historyFilters.categoryId !== "all" && item.categoryId !== historyFilters.categoryId) return false;
      return true;
    });
  }, [regularHistoryItems, historyFilters]);

  const filteredTransferGroups = useMemo(() => {
    return transferGroups.filter((item) => {
      if (historyFilters.type !== "all" && historyFilters.type !== "transfer") return false;
      if (historyFilters.accountId !== "all" && item.sourceAccountId !== historyFilters.accountId && item.destinationAccountId !== historyFilters.accountId) return false;
      if (historyFilters.categoryId !== "all" && item.categoryId !== historyFilters.categoryId) return false;
      return true;
    });
  }, [transferGroups, historyFilters]);

  const loadHistory = useCallback(async (month = historyMonth) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/bff/transactions/list?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "No se pudo cargar el historial");
      }

      const data = (await response.json()) as TransactionListResponse;
      setHistoryItems(data.transactions);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "No se pudo cargar el historial");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyMonth]);

  return {
    historyLoading,
    historyError,
    setHistoryError,
    historyItems,
    historyFilters,
    setHistoryFilters,
    regularHistoryItems,
    transferGroups,
    historyAccountOptions,
    historyCategoryOptions,
    filteredRegularHistoryItems,
    filteredTransferGroups,
    loadHistory
  };
}
