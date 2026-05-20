import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized } from "@/lib/bff/http";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const { id } = await params;
  const input = (await request.json().catch(() => null)) as { active?: unknown } | null;
  const active = typeof input?.active === "boolean" ? input.active : null;
  if (active === null) {
    return badRequest(request, "active must be boolean");
  }

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/BillableParties/${encodeURIComponent(id)}/active`, {
    method: "PATCH",
    body: JSON.stringify(active),
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
