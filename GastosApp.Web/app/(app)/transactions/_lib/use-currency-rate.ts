"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Currency, ResolvedFxRate } from "@/lib/contracts/currencies";

export const BASE_CURRENCY = "MXN";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${path}`);
  }

  return (await response.json()) as T;
}

export type CurrencyRateState = {
  currencies: Currency[];
  currencyCode: string;
  setCurrencyCode: (value: string) => void;
  /** Tasa que se enviará al API. Editable: si el usuario la cambia, se guarda su valor. */
  fxRate: string;
  setFxRate: (value: string) => void;
  fxRateDate: string | null;
  /** Tasa cargada del catálogo, para poder avisar que se editó y ofrecer volver a ella. */
  suggestedRate: number | null;
  rateLoading: boolean;
  rateError: string | null;
  /** `true` cuando la tasa sugerida es anterior a la fecha del movimiento. */
  isCarryForward: boolean;
  isBaseCurrency: boolean;
  resetRate: () => void;
};

/**
 * Carga el catálogo de divisas y resuelve la tasa de la divisa elegida para una fecha.
 *
 * La tasa se pide **al cambiar de divisa o de fecha**, nunca al abrir un movimiento existente: en la
 * edición se rellena con la tasa guardada y no se vuelve a descargar. Esa distinción es la que evita
 * reescribir el consolidado de un mes cerrado al corregir una descripción.
 */
export function useCurrencyRate(
  transactionDate: string,
  initialCurrencyCode?: string,
  initialRate?: number | null,
  initialRateDate?: string | null
): CurrencyRateState {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currencyCode, setCurrencyCode] = useState(initialCurrencyCode ?? BASE_CURRENCY);
  const [fxRate, setFxRate] = useState(initialRate != null ? String(initialRate) : "");
  const [fxRateDate, setFxRateDate] = useState<string | null>(initialRateDate ?? null);
  const [suggestedRate, setSuggestedRate] = useState<number | null>(initialRate ?? null);
  const [isCarryForward, setIsCarryForward] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  // Evita que la respuesta de una divisa anterior pise la de la divisa actual.
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;

    fetchJson<Currency[]>("/api/bff/currencies")
      .then((list) => {
        if (!cancelled) {
          setCurrencies(list);
        }
      })
      .catch(() => {
        // Sin catálogo el formulario sigue funcionando en la divisa base: no se bloquea la captura.
        if (!cancelled) {
          setCurrencies([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isBaseCurrency = currencyCode === BASE_CURRENCY;

  const loadRate = useCallback(async (code: string, date: string) => {
    if (code === BASE_CURRENCY) {
      return;
    }

    const current = ++requestId.current;
    setRateLoading(true);
    setRateError(null);

    try {
      const query = new URLSearchParams({ currency: code });
      if (ISO_DATE.test(date)) {
        query.set("date", date);
      }

      const rate = await fetchJson<ResolvedFxRate>(`/api/bff/fx-rates/rate?${query.toString()}`);
      if (current !== requestId.current) {
        return;
      }

      setSuggestedRate(rate.rateMxn);
      setFxRate(String(rate.rateMxn));
      setFxRateDate(rate.rateDate);
      setIsCarryForward(rate.isCarryForward);
    } catch {
      if (current !== requestId.current) {
        return;
      }

      // Sin tasa publicada no se inventa una: se deja el campo vacío y el API rechazará el alta.
      setSuggestedRate(null);
      setFxRate("");
      setFxRateDate(null);
      setIsCarryForward(false);
      setRateError("No hay tipo de cambio publicado para esa divisa en la fecha del movimiento");
    } finally {
      if (current === requestId.current) {
        setRateLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isBaseCurrency) {
      setSuggestedRate(null);
      setFxRate("");
      setFxRateDate(null);
      setIsCarryForward(false);
      setRateError(null);
      return;
    }

    void loadRate(currencyCode, transactionDate);
  }, [currencyCode, transactionDate, isBaseCurrency, loadRate]);

  const resetRate = useCallback(() => {
    if (suggestedRate != null) {
      setFxRate(String(suggestedRate));
    }
  }, [suggestedRate]);

  return {
    currencies,
    currencyCode,
    setCurrencyCode,
    fxRate,
    setFxRate,
    fxRateDate,
    suggestedRate,
    rateLoading,
    rateError,
    isCarryForward,
    isBaseCurrency,
    resetRate
  };
}
