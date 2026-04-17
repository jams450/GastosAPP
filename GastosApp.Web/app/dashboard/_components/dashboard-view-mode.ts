export type DashboardViewMode = "detail" | "headers" | "grid2" | "grid3";

export const dashboardViewModeLabel: Record<DashboardViewMode, string> = {
  detail: "Detalle",
  headers: "Solo header",
  grid2: "Tarjetas x2",
  grid3: "Tarjetas x3"
};
