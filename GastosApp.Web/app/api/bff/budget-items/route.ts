import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeBudgetItems } from "@/lib/contracts/budget-items";
import { resolvePeriodParam } from "@/lib/contracts/budgets";

/** Solo los filtros que el API acepta: cualquier otro valor se descarta en vez de reenviarse. */
function optionalFilter(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: Request) {
  const session = await getServerSession();

  if (!session) {
    return unauthorized(request);
  }

  const { searchParams } = new URL(request.url);
  const period = resolvePeriodParam(searchParams.get("period"));
  if (!period.ok) {
    return badRequest(request, period.message);
  }

  const params = new URLSearchParams({ period: period.data });
  const kind = optionalFilter(searchParams.get("kind"));
  const status = optionalFilter(searchParams.get("status"));
  if (kind) {
    params.set("kind", kind);
  }
  if (status) {
    params.set("status", status);
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/budget-items?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch budget items";
    const out = upstreamError(request, response.status, message);
    await attachSessionCookie(out, updatedSession, session);
    return out;
  }

  const raw = await response.json().catch(() => []);
  const out = NextResponse.json(normalizeBudgetItems(raw));
  await attachSessionCookie(out, updatedSession, session);
  return out;
}

export async function POST(request: Request) {
  const session = await getServerSession();

  if (!session) {
    return unauthorized(request);
  }

  // `periodKey` no viaja: el API lo deriva de `plannedDate`. El body se reenvía tal cual.
  const body = await request.json().catch(() => null);

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/budget-items`, {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  const out = new NextResponse(raw, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
  await attachSessionCookie(out, updatedSession, session);
  return out;
}
