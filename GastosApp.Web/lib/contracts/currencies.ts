/**
 * Contratos de monedas y tipos de cambio tal como los entrega el BFF.
 *
 * Los normalizadores aceptan camelCase y PascalCase porque la API serializa con la política por defecto
 * de ASP.NET Core, y un cambio de política no debe romper la interfaz en silencio: la forma que llega se
 * valida aquí, en un solo lugar.
 */

export type Currency = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  isBase: boolean;
};

export type LatestFxRate = {
  currencyCode: string;
  /** `yyyy-MM-dd` de publicación de la tasa, no de la consulta. */
  rateDate: string;
  rateMxn: number;
  source: string;
};

export type ResolvedFxRate = LatestFxRate & {
  requestedDate: string;
  /** `true` cuando la tasa usada es anterior a la fecha pedida. */
  isCarryForward: boolean;
};

type UnknownRecord = Record<string, unknown>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  // Se corta en la "T" por si algún serializador devuelve un DateTime completo.
  const candidate = value.slice(0, 10);
  return ISO_DATE.test(candidate) ? candidate : null;
}

function read(record: UnknownRecord, camel: string, pascal: string): unknown {
  return record[camel] ?? record[pascal];
}

export function normalizeCurrency(input: unknown): Currency | null {
  if (!isRecord(input)) {
    return null;
  }

  const rawCode = read(input, "code", "Code");
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (code.length !== 3) {
    return null;
  }

  const decimals = toFiniteNumber(read(input, "decimals", "Decimals"));
  const rawName = read(input, "name", "Name");
  const rawSymbol = read(input, "symbol", "Symbol");

  return {
    code,
    name: typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim() : code,
    symbol: typeof rawSymbol === "string" ? rawSymbol : "",
    decimals: decimals === null || decimals < 0 ? 2 : Math.trunc(decimals),
    isBase: Boolean(read(input, "isBase", "IsBase"))
  };
}

export function normalizeCurrencies(input: unknown): Currency[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeCurrency(item))
    .filter((currency): currency is Currency => currency !== null);
}

export function normalizeLatestFxRate(input: unknown): LatestFxRate | null {
  if (!isRecord(input)) {
    return null;
  }

  const rawCode = read(input, "currencyCode", "CurrencyCode");
  const currencyCode = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  const rateDate = toIsoDate(read(input, "rateDate", "RateDate"));
  const rateMxn = toFiniteNumber(read(input, "rateMxn", "RateMxn"));

  // Una tasa sin fecha o no positiva no se puede usar para convertir: se descarta en vez de mostrar 0.
  if (currencyCode.length !== 3 || rateDate === null || rateMxn === null || rateMxn <= 0) {
    return null;
  }

  const rawSource = read(input, "source", "Source");

  return {
    currencyCode,
    rateDate,
    rateMxn,
    source: typeof rawSource === "string" ? rawSource : "unknown"
  };
}

export function normalizeLatestFxRates(input: unknown): LatestFxRate[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeLatestFxRate(item))
    .filter((rate): rate is LatestFxRate => rate !== null);
}

export function normalizeResolvedFxRate(input: unknown): ResolvedFxRate | null {
  const rate = normalizeLatestFxRate(input);
  if (rate === null || !isRecord(input)) {
    return null;
  }

  const requestedDate = toIsoDate(read(input, "requestedDate", "RequestedDate")) ?? rate.rateDate;

  // Si el campo no viene, se deduce comparando fechas: es la misma regla que aplica el servidor.
  const explicit = read(input, "isCarryForward", "IsCarryForward");

  return {
    ...rate,
    requestedDate,
    isCarryForward: typeof explicit === "boolean" ? explicit : rate.rateDate !== requestedDate
  };
}
