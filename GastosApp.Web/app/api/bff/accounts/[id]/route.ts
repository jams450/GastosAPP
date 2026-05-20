import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { unauthorized } from "@/lib/bff/http";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const session = await getServerSession();

  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const { id } = await params;
  const body = await request.json();

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/accounts/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const response = call.response;
  authSession = call.session;

  const raw = await response.text();
  const out = new NextResponse(raw, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
  await attachSessionCookie(out, authSession, session);
  return out;
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getServerSession();

  if (!session) {
    return unauthorized(_request);
  }
  let authSession = session;

  const { id } = await params;
  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/accounts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" }
  });
  const response = call.response;
  authSession = call.session;

  const raw = await response.text();
  const out = new NextResponse(raw, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
  await attachSessionCookie(out, authSession, session);
  return out;
}
