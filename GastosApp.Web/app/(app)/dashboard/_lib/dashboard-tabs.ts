export type DashboardTab = "resumen" | "efectivo" | "credito" | "proyeccion";

export type DashboardTabDefinition = {
  id: DashboardTab;
  label: string;
  description: string;
  /** Si el mes seleccionado afecta los datos de la pestaña. */
  monthScoped: boolean;
};

export const DASHBOARD_TABS: readonly DashboardTabDefinition[] = [
  {
    id: "resumen",
    label: "Resumen",
    description: "Ingresos, gastos y neto del mes",
    monthScoped: true
  },
  {
    id: "efectivo",
    label: "Efectivo",
    description: "Saldos y flujo de cuentas no-crédito",
    monthScoped: true
  },
  {
    id: "credito",
    label: "Crédito",
    description: "Snapshot actual de tarjetas y deuda",
    monthScoped: false
  },
  {
    id: "proyeccion",
    label: "Proyección",
    description: "Histórico y escenario de saldo",
    monthScoped: false
  }
];

export const DEFAULT_DASHBOARD_TAB: DashboardTab = "resumen";

export const PROJECTION_HORIZONS = [3, 6, 12] as const;

export const DEFAULT_HORIZON_MONTHS = 6;

export function parseDashboardTab(value: string | null | undefined): DashboardTab {
  return DASHBOARD_TABS.some((tab) => tab.id === value) ? (value as DashboardTab) : DEFAULT_DASHBOARD_TAB;
}

export function isMonthScopedTab(tab: DashboardTab): boolean {
  return DASHBOARD_TABS.find((definition) => definition.id === tab)?.monthScoped ?? false;
}

export function parseHorizonMonths(value: string | null | undefined, fallback = DEFAULT_HORIZON_MONTHS): number {
  const parsed = Number(value);
  return (PROJECTION_HORIZONS as readonly number[]).includes(parsed) ? parsed : fallback;
}
