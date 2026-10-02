"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCategories, fetchSubcategories } from "@/app/(app)/catalogs/_shared/catalogs-api";
import { listAccounts } from "@/app/(app)/accounts/_lib/accounts-api";
import type { Account } from "@/lib/contracts/accounts";
import type { BudgetItem, BudgetItemWriteRequest } from "@/lib/contracts/budget-items";
import type { Category } from "@/lib/contracts/categories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { Subcategory } from "@/lib/contracts/subcategories";
import {
  cancelBudgetItem,
  createBudgetItem,
  createBudgetItemFromTemplate,
  fetchBudgetItems,
  patchBudgetItemStatus,
  purgeCancelledBudgetItems,
  updateBudgetItem,
  type BudgetItemFilters
} from "../_lib/budgets-api";
import type { BudgetItemPatchableStatus } from "@/lib/contracts/budget-items";
import { filterItemsByKind, type BudgetItemKindFilter } from "../_lib/budget-items-model";

export type BudgetItemCatalogIndex = {
  categoryById: Map<number, Category>;
  subcategoryById: Map<number, Subcategory>;
  accountById: Map<number, Account>;
  merchantById: Map<number, Merchant>;
};

/** Catálogos del formulario de partida: los mismos del alta de transacciones, sin duplicar BFF. */
async function fetchItemCatalogs(): Promise<{
  categories: Category[];
  subcategories: Subcategory[];
  accounts: Account[];
  merchants: Merchant[];
}> {
  const [categories, subcategories, accounts, merchantsResponse] = await Promise.all([
    fetchCategories(),
    fetchSubcategories(),
    listAccounts(),
    fetch("/api/bff/catalogs/merchants", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((payload: unknown) => (Array.isArray(payload) ? (payload as Merchant[]) : []))
      .catch(() => [] as Merchant[])
  ]);

  return { categories, subcategories, accounts, merchants: merchantsResponse };
}

export function useBudgetItems(period: string, kindFilter: BudgetItemKindFilter) {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // El filtro por `kind` se aplica en el cliente: así el mismo fetch sirve a todas las
      // pestañas de filtro sin una ida al API por cada cambio.
      const filters: BudgetItemFilters = { period };
      setItems(await fetchBudgetItems(filters));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las partidas");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Los catálogos se cargan una sola vez: solo resuelven nombres y opciones del formulario.
  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const catalogs = await fetchItemCatalogs();
        if (!isMounted) {
          return;
        }

        setCategories(catalogs.categories);
        setSubcategories(catalogs.subcategories);
        setAccounts(catalogs.accounts);
        setMerchants(catalogs.merchants);
      } catch {
        // Sin catálogos el formulario se queda sin opciones; no se bloquea la lista por una
        // falla secundaria.
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const catalogIndex = useMemo<BudgetItemCatalogIndex>(
    () => ({
      categoryById: new Map(categories.map((category) => [category.categoryId, category])),
      subcategoryById: new Map(subcategories.map((subcategory) => [subcategory.subcategoryId, subcategory])),
      accountById: new Map(accounts.map((account) => [account.accountId, account])),
      merchantById: new Map(merchants.map((merchant) => [merchant.merchantId, merchant]))
    }),
    [accounts, categories, merchants, subcategories]
  );

  const visibleItems = useMemo(() => filterItemsByKind(items, kindFilter), [items, kindFilter]);

  // La purga no se filtra por tipo: se cuenta sobre el periodo completo para poder deshabilitarla
  // cuando no hay nada que borrar.
  const cancelledCount = useMemo(() => items.filter((item) => item.status === "cancelled").length, [items]);

  const create = useCallback(
    async (payload: BudgetItemWriteRequest) => {
      setError(null);
      await createBudgetItem(payload);
      await reload();
    },
    [reload]
  );

  /** Alta selectiva desde programada: mismo ciclo que el alta manual (error + recarga). */
  const createFromTemplate = useCallback(
    async (recurringItemId: number, periodKey: string) => {
      setError(null);
      await createBudgetItemFromTemplate(recurringItemId, periodKey);
      await reload();
    },
    [reload]
  );

  const update = useCallback(
    async (itemId: number, payload: BudgetItemWriteRequest) => {
      setError(null);
      await updateBudgetItem(itemId, payload);
      await reload();
    },
    [reload]
  );

  const changeStatus = useCallback(
    async (itemId: number, status: BudgetItemPatchableStatus) => {
      setBusyItemId(itemId);
      try {
        await patchBudgetItemStatus(itemId, status);
        await reload();
      } finally {
        setBusyItemId(null);
      }
    },
    [reload]
  );

  const cancel = useCallback(
    async (itemId: number) => {
      setBusyItemId(itemId);
      try {
        await cancelBudgetItem(itemId);
        await reload();
      } finally {
        setBusyItemId(null);
      }
    },
    [reload]
  );

  const purge = useCallback(async (): Promise<number | null> => {
    setError(null);
    const result = await purgeCancelledBudgetItems(period);
    await reload();
    return result?.deleted ?? null;
  }, [period, reload]);

  return {
    items: visibleItems,
    /** Partidas del periodo sin filtrar por tipo: el filtro es solo visual y un duplicado oculto sigue siendo duplicado. */
    allItems: items,
    totalCount: items.length,
    cancelledCount,
    catalogs: catalogIndex,
    categories,
    subcategories,
    accounts,
    merchants,
    loading,
    error,
    setError,
    busyItemId,
    reload,
    create,
    createFromTemplate,
    update,
    changeStatus,
    cancel,
    purge
  };
}
