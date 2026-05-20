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
  const tagId = parseId(id);
  if (!tagId) {
    return badRequest(request, "Invalid tag id");
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

  const currentTagCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/tags/${tagId}`, {
    method: "GET",
    cache: "no-store"
  });
  const currentTagResponse = currentTagCall.response;
  authSession = currentTagCall.session;

  if (!currentTagResponse.ok) {
    const body = (await currentTagResponse.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return upstreamError(request, currentTagResponse.status, body?.message ?? body?.Message ?? "Failed to retrieve current tag");
  }

  const currentTag = (await currentTagResponse.json()) as { name?: unknown };
  const name = typeof currentTag.name === "string" ? currentTag.name.trim() : "";
  if (!name) {
    return upstreamError(request, 500, "Invalid current tag payload");
  }

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/tags/${tagId}`, {
    method: "PUT",
    body: JSON.stringify({ name, active }),
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return upstreamError(request, response.status, body?.message ?? body?.Message ?? "Failed to update tag status");
  }

  const result = await response.json();
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, authSession, session);
  return out;
}
