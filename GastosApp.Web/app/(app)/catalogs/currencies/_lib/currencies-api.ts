import type { Currency, FxRateSyncResult, LatestFxRate } from "@/lib/contracts/currencies";
import { normalizeFxRateSyncResult } from "@/lib/contracts/currencies";
import { parseApiError } from "@/lib/bff/client-session";
import { csrfFetch } from "@/lib/security/csrf-client";
import { buildCurrencyRows, type CurrencyRow } from "./currencies-model";

async function fetchList<T>(path: string, fallbackMessage: string): Promise<T[]> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw await parseApiError(response, fallbackMessage);
  }

  return (await response.json()) as T[];
}

export async function fetchCurrencies(): Promise<Currency[]> {
  return fetchList<Currency>("/api/bff/currencies", "No se pudieron cargar las monedas");
}

export async function fetchLatestFxRates(): Promise<LatestFxRate[]> {
  return fetchList<LatestFxRate>("/api/bff/fx-rates/latest", "No se pudieron cargar los tipos de cambio");
}

/**
 * Carga el catálogo y las tasas en paralelo y las cruza.
 *
 * Las dos peticiones van juntas porque una tabla incompleta es peor que ninguna: si falla solo una, la
 * pantalla debe decir que no pudo cargar, no mostrar seis divisas con la tasa en blanco como si no
 * hubiera tasas publicadas.
 */
export async function fetchCurrencyRows(): Promise<CurrencyRow[]> {
  const [currencies, rates] = await Promise.all([fetchCurrencies(), fetchLatestFxRates()]);

  return buildCurrencyRows(currencies, rates);
}

/**
 * Fuerza una sincronización inmediata de tasas.
 *
 * Usa `csrfFetch` porque es un POST: el middleware rechaza cualquier método mutante sin el header CSRF.
 * La autorización es del API; aquí solo se propaga el 403 con un mensaje entendible.
 */
export async function requestFxRateRefresh(): Promise<FxRateSyncResult> {
  const response = await csrfFetch("/api/bff/fx-rates/refresh", { method: "POST" });

  if (!response.ok) {
    throw await parseApiError(response, "No se pudieron actualizar los tipos de cambio");
  }

  const result = normalizeFxRateSyncResult(await response.json());
  if (result === null) {
    throw new Error("Respuesta inesperada al actualizar los tipos de cambio");
  }

  return result;
}
