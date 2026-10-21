"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Currency, ResolvedFxRate } from "@/lib/contracts/currencies";

export const BASE_CURRENCY = "MXN";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Extrae la fecha de un valor de `<input type="datetime-local">` (`2026-10-16T18:00`) o de un ISO
 * completo. Sin esto, la consulta viaja sin fecha y devuelve siempre la última tasa publicada.
 */
function toIsoDate(value: string): string | null {
  const match = ISO_DATE.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

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
 * Con una tasa guardada inicial (edición de un movimiento existente) no se resuelve nada al montar:
 * se trabaja con la tasa congelada del registro y solo se consulta el catálogo si se cambia de
 * divisa. Sin ella (captura nueva) se pide la tasa publicada para la fecha del movimiento.
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

  // La tasa guardada del movimiento es la referencia mientras no se cambie de divisa. En la edición
  // no se vuelve a resolver: hacerlo reescribiría el consolidado de un mes ya cerrado.
  const stored = useRef({
    currencyCode: initialCurrencyCode ?? null,
    rate: initialRate != null && initialRate > 0 ? initialRate : null,
    date: initialRateDate ?? null
  });

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
      const isoDate = toIsoDate(date);
      if (isoDate) {
        query.set("date", isoDate);
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

    // Volver a la divisa original del movimiento restaura su tasa guardada, no la del día.
    const baseline = stored.current;
    if (baseline.currencyCode === currencyCode && baseline.rate !== null) {
      setSuggestedRate(baseline.rate);
      setFxRate(String(baseline.rate));
      setFxRateDate(baseline.date);
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
