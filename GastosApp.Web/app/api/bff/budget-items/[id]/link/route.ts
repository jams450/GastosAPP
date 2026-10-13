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

/**
 * Gastos candidatos a enlazar con la partida: mismo mes y mismo alcance, cualquier monto, sin los
 * ya enlazados. El API resuelve la lista con la partida del token y el mes de la partida; aquí no
 * se reenvía ningún filtro del cliente para no ampliar el alcance de la consulta.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const itemId = parseId(id);
  if (!itemId) {
    return badRequest(request, "Invalid budget item id");
  }

  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/budget-items/${itemId}/link/candidates`,
    {
      method: "GET",
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

  const raw = await response.json().catch(() => []);
  const out = NextResponse.json(Array.isArray(raw) ? raw : []);
  await attachSessionCookie(out, updatedSession, session);
  return out;
}

/**
 * Enlace manual de una transacción ya registrada. Solo viaja `transactionId`; el monto no se manda
 * porque el de la transacción es el autoritativo. El API responde 409 si la partida o la
 * transacción ya están enlazadas y 400 si mes, tipo o alcance no coinciden.
 */
export async function POST(request: Request, { params }: Params) {
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
  const transactionId = Number(body?.transactionId);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return badRequest(request, "transactionId is required");
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}/api/budget-items/${itemId}/link`,
    {
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({ transactionId })
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
