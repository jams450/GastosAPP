import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeDashboardProjection } from "@/lib/contracts/dashboard";

const DEFAULT_HORIZON_MONTHS = 6;
const MAX_HORIZON_MONTHS = 24;

export async function GET(request: NextRequest) {
  const session = await getServerSession();

  if (!session) {
    return unauthorized(request);
  }

  const requested = Number(request.nextUrl.searchParams.get("months"));
  const months =
    Number.isInteger(requested) && requested > 0 && requested <= MAX_HORIZON_MONTHS ? requested : DEFAULT_HORIZON_MONTHS;

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/dashboard/projection?months=${months}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch dashboard projection";
    const out = upstreamError(request, response.status, message);
    await attachSessionCookie(out, updatedSession, session);
    return out;
  }

  const raw = await response.json();
  const projection = normalizeDashboardProjection(raw);

  const out = NextResponse.json(projection);
  await attachSessionCookie(out, updatedSession, session);
  return out;
}
