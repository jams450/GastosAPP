import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeAccounts } from "@/lib/contracts/accounts";

export async function GET() {
  const session = await getServerSession();

  if (!session) {
    return unauthorized();
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/accounts`, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch accounts";
    return upstreamError(undefined, response.status, message);
  }

  const rawAccounts = await response.json();
  const accounts = normalizeAccounts(rawAccounts);

  const result = NextResponse.json(accounts);
  await attachSessionCookie(result, updatedSession, session);
  return result;
}

export async function POST(request: Request) {
  const session = await getServerSession();

  if (!session) {
    return unauthorized(request);
  }

  const body = await request.json();
  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/accounts`, {
    method: "POST",
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  const result = new NextResponse(raw, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
  await attachSessionCookie(result, updatedSession, session);
  return result;
}
