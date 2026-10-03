import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { resolvePeriodParam } from "@/lib/contracts/budgets";
import {
  normalizePlan,
  normalizePlanProjection,
  sumExpectedInvestmentIncome,
  type ExpectedInvestmentIncome
} from "@/lib/contracts/investments";

const CURRENT_ERROR_COPY = "No se pudo cargar el plan de inversión vigente";
const PROJECTION_ERROR_COPY = "No se pudo cargar la proyección del plan de inversión";

/** Sin escenario utilizable: la ausencia de plan es un estado normal, no un error. */
function emptyIncome(period: string): ExpectedInvestmentIncome {
  return { period, expectedInterest: 0, allocationCount: 0, hasPlan: false };
}

/**
 * Rendimiento mensual esperado de renta fija para `?period=yyyy-MM`.
 *
 * Lee el plan vigente (`plans/current`, que sí acepta `planMonth`) y después su proyección, y
 * suma el `Interest` de la serie del backend para el mes pedido. El importe resultante es un
 * **supuesto de proyección, no un ingreso real**: nunca se mezcla con el ejecutado ni con el
 * comprometido del plan, que viajan por el BFF de `plan/summary`.
 *
 * - 404 del plan (sin plan previo ni productos) o 403 (módulo solo-admin) → `hasPlan: false`, no
 *   error: para este lector no hay escenario visible y el bloque de ingresos lo muestra como tal.
 * - Un borrador heredado (`isPersisted: false`, id 0) tampoco es un escenario generado: no tiene
 *   serie mensual que sumar, así que cuenta como "sin plan vigente" en vez de un cero inventado.
 */
export async function GET(request: Request) {
  const session = await getServerSession();

  if (!session) {
    return unauthorized(request);
  }

  const { searchParams } = new URL(request.url);
  const period = resolvePeriodParam(searchParams.get("period"));
  if (!period.ok) {
    return badRequest(request, period.message);
  }

  const month = period.data;

  const current = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/investments/plans/current?planMonth=${encodeURIComponent(month)}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (current.response.status === 404 || current.response.status === 403) {
    const out = NextResponse.json(emptyIncome(month));
    await attachSessionCookie(out, current.session, session);
    return out;
  }

  if (!current.response.ok) {
    const out = upstreamError(request, current.response.status, CURRENT_ERROR_COPY);
    await attachSessionCookie(out, current.session, session);
    return out;
  }

  const plan = normalizePlan(await current.response.json().catch(() => null));
  if (!plan) {
    const out = upstreamError(request, 502, "Malformed investment plan response");
    await attachSessionCookie(out, current.session, session);
    return out;
  }

  if (!plan.isPersisted || !Number.isFinite(plan.investmentPlanId) || plan.investmentPlanId <= 0) {
    const out = NextResponse.json(emptyIncome(month));
    await attachSessionCookie(out, current.session, session);
    return out;
  }

  const projection = await fetchApiWithAutoRefresh(
    current.session,
    `${getApiBaseUrl()}/api/investments/plans/${plan.investmentPlanId}/projection`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  // El plan se pudo borrar entre las dos lecturas: sin serie no hay suma, estado normal.
  if (projection.response.status === 404) {
    const out = NextResponse.json(emptyIncome(month));
    await attachSessionCookie(out, projection.session, session);
    return out;
  }

  if (!projection.response.ok) {
    const out = upstreamError(request, projection.response.status, PROJECTION_ERROR_COPY);
    await attachSessionCookie(out, projection.session, session);
    return out;
  }

  const series = normalizePlanProjection(await projection.response.json().catch(() => null));
  if (!series) {
    const out = upstreamError(request, 502, "Malformed investment projection response");
    await attachSessionCookie(out, projection.session, session);
    return out;
  }

  const { expectedInterest, allocationCount } = sumExpectedInvestmentIncome(series, month);
  const out = NextResponse.json({
    period: month,
    expectedInterest,
    allocationCount,
    hasPlan: true
  } satisfies ExpectedInvestmentIncome);
  await attachSessionCookie(out, projection.session, session);
  return out;
}
