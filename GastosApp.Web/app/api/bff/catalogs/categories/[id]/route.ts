import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { validateCategoryPayload } from "@/lib/contracts/catalogs";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const categoryId = parseId(id);
  if (!categoryId) {
    return badRequest(request, "Invalid category id");
  }

  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const input = await request.json();
  const validation = validateCategoryPayload(input);
  if (!validation.ok) {
    return badRequest(request, validation.message);
  }

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/categories/${categoryId}`, {
    method: "PUT",
    body: JSON.stringify(validation.data),
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return upstreamError(request, response.status, body?.message ?? body?.Message ?? "Failed to update category");
  }

  const result = await response.json();
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, authSession, session);
  return out;
}
