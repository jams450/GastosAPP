import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeAlertRetryResult } from "@/lib/contracts/alerts";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const outboxId = parseId(id);
  if (!outboxId) {
    return badRequest(request, "Invalid outbox id");
  }

  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/alerts/outbox/${outboxId}/retry`,
    {
      method: "POST",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    const out = upstreamError(request, response.status, body?.message ?? body?.Message ?? "Failed to retry alert delivery");
    await attachSessionCookie(out, updatedSession, session);
    return out;
  }

  const raw = await response.json().catch(() => null);
  const retry = normalizeAlertRetryResult(raw);
  if (!retry) {
    const out = upstreamError(request, 502, "Malformed alert retry response");
    await attachSessionCookie(out, updatedSession, session);
    return out;
  }

  const out = NextResponse.json(retry);
  await attachSessionCookie(out, updatedSession, session);
  return out;
}
