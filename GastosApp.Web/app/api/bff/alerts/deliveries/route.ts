import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeAlertDeliveries } from "@/lib/contracts/alerts";
import { resolvePeriodParam } from "@/lib/contracts/budgets";

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

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/alerts/deliveries?period=${encodeURIComponent(period.data)}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch alert deliveries";
    const out = upstreamError(request, response.status, message);
    await attachSessionCookie(out, updatedSession, session);
    return out;
  }

  const raw = await response.json().catch(() => []);
  const out = NextResponse.json(normalizeAlertDeliveries(raw));
  await attachSessionCookie(out, updatedSession, session);
  return out;
}
