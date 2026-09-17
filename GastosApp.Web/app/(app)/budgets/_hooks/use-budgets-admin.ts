"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCategories, fetchSubcategories } from "@/app/(app)/catalogs/_shared/catalogs-api";
import type { Budget, BudgetPeriodStatus, BudgetThreshold } from "@/lib/contracts/budgets";
import type { Category } from "@/lib/contracts/categories";
import type { Subcategory } from "@/lib/contracts/subcategories";
import {
  createBudget,
  fetchBudgets,
  fetchBudgetStatuses,
  patchBudgetActive,
  replaceBudgetThresholds,
  updateBudget,
  type BudgetCreatePayload,
  type BudgetThresholdPayload,
  type BudgetUpdatePayload
} from "../_lib/budgets-api";
import { buildBudgetCatalogIndex, getExpenseCategories, getExpenseSubcategories, type BudgetCatalogIndex } from "../_lib/budgets-ui";

export type BudgetRow = {
  status: BudgetPeriodStatus;
  thresholds: BudgetThreshold[];
};

export function useBudgetsAdmin(period: string) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [statuses, setStatuses] = useState<BudgetPeriodStatus[]>([]);
  const [catalogs, setCatalogs] = useState<BudgetCatalogIndex>(() => buildBudgetCatalogIndex([], []));
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [budgetList, statusList] = await Promise.all([fetchBudgets(period), fetchBudgetStatuses(period)]);
      setBudgets(budgetList);
      setStatuses(statusList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los presupuestos");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Los catálogos se cargan una sola vez: solo resuelven nombres de alcance y opciones del formulario.
  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const [categoryList, subcategoryList] = await Promise.all([fetchCategories(), fetchSubcategories()]);
        if (!isMounted) {
          return;
        }

        setCategories(categoryList);
        setSubcategories(subcategoryList);
        setCatalogs(buildBudgetCatalogIndex(categoryList, subcategoryList));
      } catch {
        // Sin catálogos el alcance cae a `#id`; no se bloquea la vista por una falla secundaria.
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const rows = useMemo<BudgetRow[]>(() => {
    const thresholdsByBudgetId = new Map(budgets.map((budget) => [budget.budgetId, budget.thresholds]));
    return statuses.map((status) => ({
      status,
      thresholds: thresholdsByBudgetId.get(status.budgetId) ?? []
    }));
  }, [budgets, statuses]);

  const expenseCategories = useMemo(() => getExpenseCategories(categories), [categories]);
  const expenseSubcategories = useMemo(
    () => getExpenseSubcategories(subcategories, new Set(expenseCategories.map((category) => category.categoryId))),
    [subcategories, expenseCategories]
  );

  const create = useCallback(
    async (payload: BudgetCreatePayload) => {
      setError(null);
      await createBudget(payload);
      await reload();
    },
    [reload]
  );

  const update = useCallback(
    async (budgetId: number, payload: BudgetUpdatePayload, thresholds: BudgetThresholdPayload[] | null) => {
      setError(null);
      await updateBudget(budgetId, payload);
      if (thresholds) {
        await replaceBudgetThresholds(budgetId, thresholds);
      }
      await reload();
    },
    [reload]
  );

  const toggleActive = useCallback(
    async (row: BudgetRow) => {
      setError(null);
      await patchBudgetActive(row.status.budgetId, !row.status.active);
      await reload();
    },
    [reload]
  );

  return {
    rows,
    catalogs,
    expenseCategories,
    expenseSubcategories,
    loading,
    error,
    setError,
    reload,
    create,
    update,
    toggleActive
  };
}
