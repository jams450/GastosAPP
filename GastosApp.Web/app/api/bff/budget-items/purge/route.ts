import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized } from "@/lib/bff/http";
import { resolvePeriodParam } from "@/lib/contracts/budgets";

/**
 * Purga dura de partidas `cancelled` de un periodo abierto. El periodo cerrado responde 409:
 * su historial no se reescribe, así que la UI no ofrece la acción en meses anteriores.
 */
export async function DELETE(request: Request) {
  const session = await getServerSession();

  if (!session) {
    return unauthorized(request);
  }

  const { searchParams } = new URL(request.url);
  const period = resolvePeriodParam(searchParams.get("period"));
  if (!period.ok) {
    return badRequest(request, period.message);
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/budget-items/purge?period=${encodeURIComponent(period.data)}`,
    {
      method: "DELETE",
      cache: "no-store"
    }
  );

  if (!response.ok) {
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

  const raw = await response.json().catch(() => null);
  const out = NextResponse.json(raw);
  await attachSessionCookie(out, updatedSession, session);
  return out;
}
