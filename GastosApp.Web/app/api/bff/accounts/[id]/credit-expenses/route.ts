import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { unauthorized } from "@/lib/bff/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const query = month ? `?month=${encodeURIComponent(month)}` : "";

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/accounts/${encodeURIComponent(id)}/credit-expenses${query}`, {
    method: "GET",
    cache: "no-store"
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
