import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized } from "@/lib/bff/http";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

  // El API recibe el array crudo de umbrales (reemplazo completo), sin envoltorio.
  const body = await request.json().catch(() => null);

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/budgets/${budgetId}/thresholds`,
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
