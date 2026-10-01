import { normalizePlan, normalizePlanProjection, type InvestmentPlan, type InvestmentPlanProjection } from "../../../../lib/contracts/investments.ts";

export type InvestmentPlanLoad = { plan: InvestmentPlan | null; projection: InvestmentPlanProjection | null; projectionError: string | null };

/** Keep factual plan detail even when the separate forecast request fails. */
export async function loadInvestmentPlan(month: string, request: typeof fetch = fetch): Promise<InvestmentPlanLoad> {
  const response = await request(`/api/bff/investments/plans/current?planMonth=${encodeURIComponent(month)}`, { cache: "no-store" });
  if (response.status === 404) return { plan: null, projection: null, projectionError: null };
  if (!response.ok) throw new Error("No se pudo cargar el plan mensual.");
  const plan = normalizePlan(await response.json());
  if (!plan) throw new Error("invalid_plan_payload");
  if (!plan.isPersisted || plan.investmentPlanId <= 0) return { plan, projection: null, projectionError: null };
  try {
    const response = await request(`/api/bff/investments/plans/${plan.investmentPlanId}/projection`, { cache: "no-store" });
    if (!response.ok) throw new Error("projection_load_failed");
    const projection = normalizePlanProjection(await response.json());
    if (!projection) throw new Error("invalid_projection_payload");
    return { plan, projection, projectionError: null };
  } catch {
    return { plan, projection: null, projectionError: "No se pudo cargar la proyección. Se conserva el capital y la tabla del plan; no se estiman rendimientos sin una respuesta válida." };
  }
}
