import type { DashboardProjectionHistoricalMonth, DashboardProjectionMonth } from "@/lib/contracts/dashboard";

export type ProjectionChartLayout = {
  /** Total de slots temporales: histórico + Hoy (si aplica) + proyección. */
  slotCount: number;
  /** Slot propio del punto "Hoy"; `null` cuando no hay histórico y proyección que anclar. */
  todaySlot: number | null;
  /** Slot del primer mes proyectado. */
  projectionStartSlot: number;
};

/** `true` sólo si algún mes histórico tiene movimientos registrados (no "neto cero"). */
export function hasHistoryActivity(historicalMonths: DashboardProjectionHistoricalMonth[]): boolean {
  return historicalMonths.some((month) => month.hasActivity);
}

/**
 * "Hoy" ocupa su propio slot entre el último mes histórico y la primera proyección:
 * así no se solapa con la barra del último mes ni con el primer punto proyectado.
 * El slot sólo se reserva cuando hay histórico y proyección de los que anclar.
 */
export function buildProjectionChartLayout(
  historicalMonths: DashboardProjectionHistoricalMonth[],
  months: DashboardProjectionMonth[]
): ProjectionChartLayout {
  const includeToday = historicalMonths.length > 0 && months.length > 0;
  const todaySlot = includeToday ? historicalMonths.length : null;
  const projectionStartSlot = historicalMonths.length + (includeToday ? 1 : 0);

  return {
    slotCount: projectionStartSlot + months.length,
    todaySlot,
    projectionStartSlot
  };
}
