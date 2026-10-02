import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeRecurringItems, validateRecurringItemPayload } from "@/lib/contracts/recurring-items";

/** El listado acepta los mismos filtros que el API; se reenvían tal cual cuando vienen. */
function buildListQuery(url: string): string {
  const search = new URL(url).searchParams;
  const kind = search.get("kind")?.trim();
  const active = search.get("active")?.trim();

  const params = new URLSearchParams();
  if (kind) {
    params.set("kind", kind);
  }
  if (active) {
    params.set("active", active);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized();
  }

  let authSession = session;
  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/recurring-items${buildListQuery(request.url)}`, {
    method: "GET",
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch recurring items";
    return upstreamError(undefined, response.status, message);
  }

  const payload = await response.json();
  const out = NextResponse.json(normalizeRecurringItems(payload));
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
  const validation = validateRecurringItemPayload(input);
  if (!validation.ok) {
    return badRequest(request, validation.message);
  }

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/recurring-items`, {
    method: "POST",
    body: JSON.stringify(validation.data),
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return upstreamError(request, response.status, body?.message ?? body?.Message ?? "Failed to create recurring item");
  }

  const result = await response.json();
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, authSession, session);
  return out;
}
