"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExpectedInvestmentIncome } from "@/lib/contracts/investments";
import { fetchExpectedInvestmentIncome, fetchPlanSummary } from "../_lib/budgets-api";
import { summarizePlanIncome, type PlanIncomeTotals } from "../_lib/plan-model";

const SUMMARY_ERROR_COPY = "No se pudo cargar el resumen del plan";
const EXPECTED_ERROR_COPY = "No se pudieron cargar los rendimientos esperados";

/**
 * Ingresos del periodo para el bloque de Resumen: presupuestado vs real del plan más los
 * rendimientos esperados de renta fija como línea aparte.
 *
 * `enabled` ata el fetch a la pestaña visible —mismo patrón que
 * `useAlertsHistory(period, tab === "alertas")`— para no pedir un mes que nadie está mirando.
 * Los dos fetch corren en paralelo; si falla investments pero el resumen llega bien, el bloque se
 * muestra con los rendimientos en "no disponible": una falla secundaria no bloquea el bloque,
 * mismo criterio que los catálogos en `useBudgetItems`.
 */
export function usePlanIncome(period: string, enabled: boolean) {
  const [income, setIncome] = useState<PlanIncomeTotals | null>(null);
  const [expected, setExpected] = useState<ExpectedInvestmentIncome | null>(null);
  const [expectedError, setExpectedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  // Un cambio de periodo deja la petición anterior en vuelo. Este contador invalida toda
  // respuesta que no sea la de la petición más reciente: solo la última escribe estado
  // (mismo patrón que `useBudgetItemSuggestions`, donde la respuesta vieja no pisa).
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
    setExpectedError(null);

    try {
      const [planResult, expectedResult] = await Promise.allSettled([
        fetchPlanSummary(period),
        fetchExpectedInvestmentIncome(period)
      ]);

      if (!isCurrent()) {
        return;
      }

      if (planResult.status === "rejected") {
        setIncome(null);
        setExpected(null);
        setError(planResult.reason instanceof Error ? planResult.reason.message : SUMMARY_ERROR_COPY);
        return;
      }

      setIncome(summarizePlanIncome(planResult.value));

      if (expectedResult.status === "fulfilled") {
        setExpected(expectedResult.value);
      } else {
        setExpected(null);
        setExpectedError(expectedResult.reason instanceof Error ? expectedResult.reason.message : EXPECTED_ERROR_COPY);
      }
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, [period, enabled]);

  // Con la pestaña oculta no hay nada que mostrar, así que no se conserva el periodo anterior: al
  // reabrir, el bloque arranca limpio en vez de enseñar un mes que ya no es el seleccionado.
  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setIncome(null);
      setExpected(null);
      setError(null);
      setExpectedError(null);
      setLoading(false);
    }
  }, [enabled]);

  // Cambiar de periodo deja el render siguiente sin datos del mes equivocado: el efecto limpia
  // antes de que el fetch nuevo resuelva. El centinela es la combinación periodo+pestaña.
  const requestKey = `${period}:${enabled ? "1" : "0"}`;
  const [lastRequestKey, setLastRequestKey] = useState(requestKey);
  if (enabled && lastRequestKey !== requestKey) {
    setLastRequestKey(requestKey);
    setIncome(null);
    setExpected(null);
    setError(null);
    setExpectedError(null);
    setLoading(true);
  } else if (!enabled && lastRequestKey !== requestKey) {
    setLastRequestKey(requestKey);
  }

  useEffect(() => {
    void reload();
  }, [reload]);

  return useMemo(
    () => ({ income, expected, expectedError, loading, error, reload }),
    [income, expected, expectedError, loading, error, reload]
  );
}
