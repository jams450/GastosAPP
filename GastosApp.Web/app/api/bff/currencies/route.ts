import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeCurrencies } from "@/lib/contracts/currencies";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/Currencies`, {
    method: "GET",
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch currencies";
    return upstreamError(request, response.status, message);
  }

  const payload = await response.json();
  const out = NextResponse.json(normalizeCurrencies(payload));
  await attachSessionCookie(out, authSession, session);
  return out;
}
