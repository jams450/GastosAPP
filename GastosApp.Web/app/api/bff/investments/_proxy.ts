import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { forbidden, unauthorized } from "@/lib/bff/http";

function isAdmin(role?: string) {
  return (role ?? "").toLowerCase() === "admin";
}

export async function investmentProxy(request: Request, path: string) {
  const session = await getServerSession();
  if (!session) return unauthorized(request);
  if (!isAdmin(session.user.role)) return forbidden(request);

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (request.method !== "GET" && contentType?.toLowerCase().startsWith("application/json")) {
    headers.set("content-type", contentType);
  }

  const response = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/investments/${path}`, {
    method: request.method,
    cache: "no-store",
    headers,
    body: request.method === "GET" ? undefined : await request.text()
  });
  const out = new NextResponse(await response.response.text(), {
    status: response.response.status,
    headers: { "content-type": response.response.headers.get("content-type") ?? "application/json" }
  });
  await attachSessionCookie(out, response.session, session);
  return out;
}
