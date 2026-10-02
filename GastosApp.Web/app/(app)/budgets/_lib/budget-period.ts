// El alias `@/` no lo resuelve `node --test`: el import de valor va con ruta relativa y
// extensión explícita, igual que en los demás módulos puros probables del repositorio.
import { formatPeriodLabel } from "./budgets-ui.ts";

/** Periodo `yyyy-MM` con mes real: `2026-13` o `2026-1` no son periodos. */
const BUDGET_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Dirección de la navegación relativa del periodo. */
export type BudgetPeriodStep = -1 | 1;

export function isBudgetPeriod(value: unknown): value is string {
  return typeof value === "string" && BUDGET_PERIOD_PATTERN.test(value);
}

/**
 * Desplaza `months` meses con aritmética entera de año/mes.
 *
 * Nunca pasa por `Date`: un `new Date("2026-01")` se corre un día por zona horaria y
 * `setMonth` desborda (31 de enero → 3 de marzo). Si el periodo o el desplazamiento no son
 * utilizables devuelve `null` en lugar de fabricar una fecha.
 */
export function shiftPeriod(period: string, months: number): string | null {
  if (!isBudgetPeriod(period) || !Number.isInteger(months)) {
    return null;
  }

  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));

  // Meses desde el año 0: el salto de diciembre a enero es aritmética, no un caso especial.
  const totalMonths = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = totalMonths - nextYear * 12 + 1;

  // Un año fuera de `0001-9999` ya no cabe en el dominio `yyyy-MM`: se devuelve `null`, no un año
  // cero ni negativo. `0000` es sintácticamente `yyyy` pero no es un periodo que el backend acepte.
  if (nextYear < 1 || nextYear > 9999) {
    return null;
  }

  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

/** Periodo anterior; `null` si `period` no es un periodo válido. */
export function previousPeriod(period: string): string | null {
  return shiftPeriod(period, -1);
}

/**
 * Periodo que la URL describe; `current` (el mes en curso) cuando no trae `?period=` o lo trae
 * ilegible.
 *
 * Es la única lectura de la URL para el periodo: la pantalla ajusta su estado durante el render
 * comparando contra el último valor visto, en vez de con un efecto lector. Un efecto lector corre
 * antes de que `router.replace` propague la escritura propia, así que veía la URL vieja y revertía
 * la elección del usuario; además dejaba pegado el mes anterior al volver atrás a una URL sin
 * parámetros.
 */
export function periodFromUrlQuery(urlQuery: string, current: string): string {
  const requested = new URLSearchParams(urlQuery).get("period");
  return requested !== null && isBudgetPeriod(requested) ? requested : current;
}

/** Periodo siguiente; `null` si `period` no es un periodo válido. */
export function nextPeriod(period: string): string | null {
  return shiftPeriod(period, 1);
}

/**
 * Valor de `?period=` del periodo visible; `null` significa URL limpia.
 *
 * Misma convención que `budgetsTabQueryValue`: el mes en curso no viaja en la URL, así que
 * compartir el enlace de la pantalla no fija el periodo de quien lo recibe.
 */
export function budgetPeriodQueryValue(period: string, current: string): string | null {
  if (!isBudgetPeriod(period) || period === current) {
    return null;
  }

  return period;
}

/** Nombre accesible del botón de navegación: "Mes anterior: septiembre de 2026". */
export function periodNavLabel(period: string, step: BudgetPeriodStep = -1): string {
  const prefix = step < 0 ? "Mes anterior" : "Mes siguiente";
  return `${prefix}: ${formatPeriodLabel(period)}`;
}
