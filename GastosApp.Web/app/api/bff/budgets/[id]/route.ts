import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeBudget } from "@/lib/contracts/budgets";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const budgetId = parseId(id);
  if (!budgetId) {
    return badRequest(request, "Invalid budget id");
  }

  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/budgets/${budgetId}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch budget";
    const out = upstreamError(request, response.status, message);
    await attachSessionCookie(out, updatedSession, session);
    return out;
  }

  const raw = await response.json().catch(() => null);
  const budget = normalizeBudget(raw);
  if (!budget) {
    const out = upstreamError(request, 502, "Malformed budget response");
    await attachSessionCookie(out, updatedSession, session);
    return out;
  }

  const out = NextResponse.json(budget);
  await attachSessionCookie(out, updatedSession, session);
  return out;
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const budgetId = parseId(id);
  if (!budgetId) {
    return badRequest(request, "Invalid budget id");
  }

  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }

  const body = await request.json().catch(() => null);

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/budgets/${budgetId}`,
    {
      method: "PUT",
      cache: "no-store",
      body: JSON.stringify(body)
    }
  );

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
