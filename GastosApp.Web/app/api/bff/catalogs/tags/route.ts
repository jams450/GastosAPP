import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { validateTagPayload } from "@/lib/contracts/catalogs";
import { normalizeTags } from "@/lib/contracts/tags";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return unauthorized();
  }

  let authSession = session;
  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/tags`, {
    method: "GET",
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch tags";
    return upstreamError(undefined, response.status, message);
  }

  const payload = await response.json();
  const out = NextResponse.json(normalizeTags(payload));
  await attachSessionCookie(out, authSession, session);
  return out;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const input = await request.json();
  const validation = validateTagPayload(input);
  if (!validation.ok) {
    return badRequest(request, validation.message);
  }

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/tags`, {
    method: "POST",
    body: JSON.stringify(validation.data),
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return upstreamError(request, response.status, body?.message ?? body?.Message ?? "Failed to create tag");
  }

  const result = await response.json();
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, authSession, session);
  return out;
}
