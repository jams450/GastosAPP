import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { isAlertOutboxStatus, normalizeAlertOutbox } from "@/lib/contracts/alerts";

export async function GET(request: Request) {
  const session = await getServerSession();

  if (!session) {
    return unauthorized(request);
  }

  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status");
  const status = rawStatus?.trim().toLowerCase();
  if (status && !isAlertOutboxStatus(status)) {
    return badRequest(request, "status must be one of: pending, sent, failed");
  }

  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/alerts/outbox${query}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch alert outbox";
    const out = upstreamError(request, response.status, message);
    await attachSessionCookie(out, updatedSession, session);
    return out;
  }

  const raw = await response.json().catch(() => []);
  const out = NextResponse.json(normalizeAlertOutbox(raw));
  await attachSessionCookie(out, updatedSession, session);
  return out;
}
