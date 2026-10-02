"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchRecurringItems } from "@/app/(app)/catalogs/_shared/catalogs-api";
import type { BudgetItem } from "@/lib/contracts/budget-items";
import type { RecurringItem } from "@/lib/contracts/recurring-items";
import { pendingTemplatesForPeriod } from "../_lib/budget-template-occurrence";

/**
 * Programadas que pueden entrar al periodo en un clic. Solo se consulta cuando la pestaña de
 * partidas está visible: el catálogo no cambia con el filtro de tipo y el periodo lo filtra el
 * modelo puro en el cliente.
 */
export function useBudgetTemplates(period: string, items: BudgetItem[], enabled: boolean) {
  const [templates, setTemplates] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setTemplates(await fetchRecurringItems());
    } catch (err) {
      setTemplates([]);
      setError(err instanceof Error ? err.message : "No se pudieron cargar las programadas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void reload();
  }, [enabled, reload]);

  return {
    templates: pendingTemplatesForPeriod(templates, items, period),
    loading,
    error,
    reload
  };
}
