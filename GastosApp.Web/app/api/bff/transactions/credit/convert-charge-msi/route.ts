import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";

type Payload = {
  sourceTransactionId?: unknown;
  months?: unknown;
};

function parsePositiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const body = (await request.json().catch(() => null)) as Payload | null;
  const sourceTransactionId = parsePositiveInt(body?.sourceTransactionId);
  const months = parsePositiveInt(body?.months);

  if (!sourceTransactionId || !months || months < 2 || months > 60) {
    return badRequest(request, "sourceTransactionId and months(2..60) are required");
  }

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/transactions/credit/convert-charge-msi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceTransactionId, months }),
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return upstreamError(request, response.status, errorBody?.message ?? errorBody?.Message ?? "Failed to convert charge to MSI");
  }

  const result = await response.json().catch(() => ({}));
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, authSession, session);
  return out;
}
