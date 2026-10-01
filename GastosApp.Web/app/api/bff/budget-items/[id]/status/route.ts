import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized } from "@/lib/bff/http";
import { BUDGET_ITEM_PATCHABLE_STATUSES } from "@/lib/contracts/budget-items";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const itemId = parseId(id);
  if (!itemId) {
    return badRequest(request, "Invalid budget item id");
  }

  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }

  const body = await request.json().catch(() => null);
  const status = typeof body?.status === "string" ? body.status.trim().toLowerCase() : "";
  if (!(BUDGET_ITEM_PATCHABLE_STATUSES as readonly string[]).includes(status)) {
    // `cancelled` se alcanza por el endpoint de cancelación, no por esta transición genérica.
    return badRequest(request, "status must be one of: pending, executed, ignored");
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/budget-items/${itemId}/status`,
    {
      method: "PATCH",
      cache: "no-store",
      body: JSON.stringify({ status })
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
