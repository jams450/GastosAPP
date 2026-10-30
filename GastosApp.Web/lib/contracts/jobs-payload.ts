/**
 * Coerciones internas del contrato de jobs (S1/S7).
 *
 * El BFF y la pantalla leen el mismo payload: la API responde PascalCase y el BFF normaliza a
 * camelCase, así que cada campo se busca por su nombre camel y se cae al PascalCase. Un `null`
 * explícito se respeta: es un valor del contrato (fin nulo mientras corre), no un campo ausente.
 *
 * Este módulo no forma parte de la superficie pública (`jobs.ts` no lo reexporta): solo existe para
 * que los módulos del contrato no dupliquen la misma coerción.
 */

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function field(record: UnknownRecord, camel: string): unknown {
  const value = record[camel];
  if (value !== undefined) return value;
  return record[camel.charAt(0).toUpperCase() + camel.slice(1)];
}

export function toTrimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function toInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

export function toNonNegativeInteger(value: unknown): number | null {
  const parsed = toInteger(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

export function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

export function toEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : null;
}

/**
 * Fecha ISO normalizada, o nula si no se puede interpretar. Comparar y ordenar cadenas con zonas
 * distintas es frágil; guardar la forma canónica deja una sola representación.
 */
export function toIsoString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
