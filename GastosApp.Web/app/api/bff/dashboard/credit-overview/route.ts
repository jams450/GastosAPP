import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeDashboardCreditOverview } from "@/lib/contracts/dashboard";

export async function GET(request: NextRequest) {
  const session = await getServerSession();

  if (!session) {
    return unauthorized(request);
  }

  const month = request.nextUrl.searchParams.get("month");
  const query = month ? `?month=${encodeURIComponent(month)}` : "";

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/dashboard/credit-overview${query}`, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch dashboard data";
    const out = upstreamError(request, response.status, message);
    await attachSessionCookie(out, updatedSession, session);
    return out;
  }

  const raw = await response.json();
  const dashboard = normalizeDashboardCreditOverview(raw);

  const out = NextResponse.json(dashboard);
  await attachSessionCookie(out, updatedSession, session);
  return out;
}
