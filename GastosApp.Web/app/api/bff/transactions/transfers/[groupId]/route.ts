import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";

type Params = { params: Promise<{ groupId: string }> };

function mapErrorMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) {
    return fallback;
  }

  const value = body as { message?: string; Message?: string };
  return value.message ?? value.Message ?? fallback;
}

function isValidGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function PUT(request: Request, { params }: Params) {
  const { groupId } = await params;
  if (!isValidGuid(groupId)) {
    return badRequest(request, "Invalid transfer group id");
  }

  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return badRequest(request, "Invalid request body");
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/transactions/transfer/${groupId}`, {
    method: "PUT",
    body: JSON.stringify(body),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const result = upstreamError(request, response.status, mapErrorMessage(errorBody, "Failed to update transfer"));
    await attachSessionCookie(result, updatedSession, session);
    return result;
  }

  const result = await response.json().catch(() => ({}));
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, updatedSession, session);
  return out;
}

export async function DELETE(_request: Request, { params }: Params) {
  const { groupId } = await params;
  if (!isValidGuid(groupId)) {
    return badRequest(_request, "Invalid transfer group id");
  }

  const session = await getServerSession();
  if (!session) {
    return unauthorized(_request);
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/transactions/transfer/${groupId}`, {
    method: "DELETE",
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const result = upstreamError(_request, response.status, mapErrorMessage(errorBody, "Failed to delete transfer"));
    await attachSessionCookie(result, updatedSession, session);
    return result;
  }

  const result = await response.json().catch(() => ({}));
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, updatedSession, session);
  return out;
}
