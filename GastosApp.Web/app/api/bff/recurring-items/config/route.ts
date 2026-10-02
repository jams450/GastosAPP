import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeRecurringItemConfig } from "@/lib/contracts/recurring-items";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return unauthorized();
  }

  let authSession = session;
  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/recurring-items/config`, {
    method: "GET",
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch recurring items config";
    return upstreamError(undefined, response.status, message);
  }

  const payload = await response.json();
  const out = NextResponse.json(normalizeRecurringItemConfig(payload));
  await attachSessionCookie(out, authSession, session);
  return out;
}
