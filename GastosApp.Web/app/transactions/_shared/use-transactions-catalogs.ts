"use client";

import { useCallback, useEffect, useState } from "react";
import { parseApiError } from "@/lib/bff/client-session";
import type { CatalogsResponse } from "../_lib/transactions-types";

export function useTransactionsCatalogs() {
  const [catalogs, setCatalogs] = useState<CatalogsResponse | null>(null);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);

  const loadCatalogs = useCallback(async () => {
    setCatalogsLoading(true);
    setCatalogsError(null);

    try {
      const response = await fetch("/api/bff/transactions/catalogs", { cache: "no-store" });
      if (!response.ok) {
        throw await parseApiError(response, "No fue posible cargar catálogos");
      }

      const data = (await response.json()) as CatalogsResponse;
      setCatalogs(data);
    } catch (err) {
      setCatalogsError(err instanceof Error ? err.message : "No se pudieron cargar cuentas y categorías.");
    } finally {
      setCatalogsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalogs();
  }, [loadCatalogs]);

  return {
    catalogs,
    catalogsLoading,
    catalogsError,
    setCatalogsError,
    loadCatalogs
  };
}
