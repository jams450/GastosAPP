import type { Currency, FxRateSyncResult, LatestFxRate } from "@/lib/contracts/currencies";

/**
 * Una fila de la tabla de Monedas: la divisa y, si la tiene, su última tasa conocida.
 *
 * Es un tipo propio y no `Currency & LatestFxRate` porque la divisa base nunca tiene tasa: mezclar
 * ambas formas obligaría a la tabla a defenderse de combinaciones que no existen.
 */
export type CurrencyRow = Currency & {
  rateMxn: number | null;
  rateDate: string | null;
  source: string | null;
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Cruza el catálogo con las tasas por código de divisa.
 *
 * Conserva el orden del catálogo (la base primero, como lo entrega la API) en lugar de reordenar: el
 * orden es una decisión del servidor y duplicarla aquí solo crea dos fuentes de verdad.
 */
export function buildCurrencyRows(currencies: Currency[], rates: LatestFxRate[]): CurrencyRow[] {
  const rateByCode = new Map(rates.map((rate) => [rate.currencyCode, rate]));

  return currencies.map((currency) => {
    if (currency.isBase) {
      return { ...currency, rateMxn: null, rateDate: null, source: null };
    }

    const rate = rateByCode.get(currency.code);
    return {
      ...currency,
      rateMxn: rate?.rateMxn ?? null,
      rateDate: rate?.rateDate ?? null,
      source: rate?.source ?? null
    };
  });
}

/**
 * Formatea una tasa con dos decimales como mínimo y hasta seis, sin ceros sobrantes.
 *
 * No usa `Intl` a propósito: el resultado tiene que ser idéntico en cualquier entorno, y el formato de
 * moneda de la interfaz ya lo resuelve `formatCurrency` para los importes, no para las tasas.
 */
export function formatRate(rateMxn: number | null): string {
  if (rateMxn === null || !Number.isFinite(rateMxn) || rateMxn <= 0) {
    // Una tasa en cero o negativa no se muestra: sugeriría una conversión que no existe.
    return "—";
  }

  const trimmed = rateMxn.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  const [integerPart, decimalPart = ""] = trimmed.split(".");

  return `${integerPart}.${decimalPart.padEnd(2, "0")}`;
}

/** Etiqueta de la columna de tasa: la base no convierte, y una divisa sin publicación no inventa una. */
export function rateLabel(row: CurrencyRow): string {
  if (row.isBase) {
    return "Base";
  }

  return row.rateMxn === null ? "Sin tasa" : `${formatRate(row.rateMxn)} MXN`;
}

/**
 * Formatea la fecha de publicación (`yyyy-MM-dd`) como `16 oct 2026`.
 *
 * Se construye a mano y no con `new Date(iso)`: interpretar `2026-10-16` como medianoche UTC y
 * formatearlo en hora local de México mostraría el día anterior. Ese desfase haría que la tabla
 * mostrara una tasa del 15 de octubre con datos del 16.
 */
export function formatRateDate(iso: string | null): string {
  if (iso === null) {
    return "—";
  }

  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    return "—";
  }

  const [year, month, day] = parts;
  const monthLabel = MONTHS[month - 1];
  if (monthLabel === undefined) {
    return "—";
  }

  return `${day} ${monthLabel} ${year}`;
}

/**
 * Mensaje para el usuario tras forzar una sincronización.
 *
 * Se redacta aquí, y no en el componente, porque el caso que importa es el que no cambió nada: si todas
 * las tasas ya estaban publicadas, la respuesta correcta es "ya estaban al día" y no un éxito vacío que
 * sugiera que se descargó algo.
 */
export function describeSyncResult(result: FxRateSyncResult): string {
  const updated =
    result.synced === 1 ? "1 tasa actualizada" : `${result.synced} tasas actualizadas`;
  const failed =
    result.failed === 1 ? "1 no se pudo actualizar" : `${result.failed} no se pudieron actualizar`;

  if (result.synced === 0 && result.failed === 0) {
    return "Las tasas ya estaban al día";
  }

  if (result.synced === 0) {
    return `Ninguna tasa se pudo actualizar: ${failed}; se conserva la última publicada`;
  }

  return result.failed === 0 ? updated : `${updated}; ${failed}`;
}
