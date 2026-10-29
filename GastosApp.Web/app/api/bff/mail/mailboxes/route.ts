import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { unauthorized, upstreamError } from "@/lib/bff/http";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return unauthorized();
  }

  const call = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/emailclassification/mailboxes`, {
    method: "GET",
    cache: "no-store"
  });
  const response = call.response;

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "No se pudieron leer los buzones";
    return upstreamError(undefined, response.status, message);
  }

  const payload = await response.json();
  const out = NextResponse.json(payload);
  await attachSessionCookie(out, call.session, session);
  return out;
}
