import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const subcategoryId = parseId(id);
  if (!subcategoryId) {
    return badRequest(request, "Invalid subcategory id");
  }

  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const input = (await request.json().catch(() => null)) as { active?: unknown } | null;
  const active = typeof input?.active === "boolean" ? input.active : null;
  if (active === null) {
    return badRequest(request, "active must be boolean");
  }

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/subcategories/${subcategoryId}/active`, {
    method: "PATCH",
    body: JSON.stringify(active),
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return upstreamError(request, response.status, body?.message ?? body?.Message ?? "Failed to update subcategory status");
  }

  const result = await response.json();
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, authSession, session);
  return out;
}
