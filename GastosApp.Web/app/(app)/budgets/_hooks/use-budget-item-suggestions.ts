"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BudgetItemSuggestion } from "@/lib/contracts/budget-items";
import { fetchBudgetItemSuggestions } from "../_lib/budgets-api";
import { sortBudgetItemSuggestions } from "../_lib/budget-suggestions-model";

/**
 * Sugerencias de enlace del periodo. Es un endpoint de solo lectura y sin filtros: no hay nada que
 * escribir aquí. `enabled` ata el fetch a la pestaña visible —mismo patrón que
 * `useAlertsHistory(period, tab === "alertas")`— para no pedir un mes que nadie está mirando.
 */
export function useBudgetItemSuggestions(period: string, enabled: boolean) {
  const [suggestions, setSuggestions] = useState<BudgetItemSuggestion[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  // Un cambio de periodo o de pestaña deja la petición anterior en vuelo. Un guarda de montaje no
  // basta: al cambiar de agosto a septiembre, la respuesta lenta de agosto puede llegar después y
  // pisar a la de septiembre, y el usuario vería un mes bajo otro. Este contador invalida toda
  // respuesta que no sea la de la petición más reciente: solo la última escriben estado.
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const isCurrent = () => mountedRef.current && requestId === requestIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const loaded = await fetchBudgetItemSuggestions(period);
      if (isCurrent()) {
        setSuggestions(loaded);
      }
    } catch (err) {
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar las sugerencias");
      }
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, [period, enabled]);

  // Con la pestaña oculta no hay nada que mostrar, así que no se conserva el periodo anterior: al
  // reabrir, la lista arranca limpia en vez de enseñar un mes que ya no es el seleccionado.
  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setSuggestions([]);
      setError(null);
      setLoading(false);
    }
  }, [enabled]);

  // Cambiar de periodo deja el render siguiente sin datos del mes equivocado: el efecto limpia
  // antes de que el fetch nuevo resuelva, así no hay un instante con las filas de agosto bajo
  // septiembre. El centinela es la combinación periodo+pestaña, no solo el periodo, para no
  // relimpiar cuando la pestaña se abre y el periodo no cambió.
  const requestKey = `${period}:${enabled ? "1" : "0"}`;
  const [lastRequestKey, setLastRequestKey] = useState(requestKey);
  if (enabled && lastRequestKey !== requestKey) {
    setLastRequestKey(requestKey);
    setSuggestions([]);
    setError(null);
    setLoading(true);
  } else if (!enabled && lastRequestKey !== requestKey) {
    setLastRequestKey(requestKey);
  }

  useEffect(() => {
    void reload();
  }, [reload]);

  const ordered = useMemo(() => sortBudgetItemSuggestions(suggestions), [suggestions]);

  return {
    suggestions: ordered,
    loading,
    error,
    reload
  };
}