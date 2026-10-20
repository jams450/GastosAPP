import type { Currency, LatestFxRate } from "@/lib/contracts/currencies";
import { parseApiError } from "@/lib/bff/client-session";
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
