import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeFxRateSyncResult } from "@/lib/contracts/currencies";

/**
 * Fuerza una sincronización de tipos de cambio.
 *
 * El CSRF lo valida el middleware para todo método mutante, así que el cliente debe enviar el header;
 * `csrfFetch` lo hace. El rol se comprueba en el API, no aquí: duplicar la regla en el BFF crearía dos
 * fuentes de verdad sobre quién puede escribir datos globales.
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/FxRates/refresh`, {
    method: "POST",
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    if (response.status === 403) {
      return upstreamError(request, 403, "Se requiere rol de administración para actualizar las tasas");
    }

    const message = response.status === 401 ? "Session expired" : "Failed to refresh fx rates";
    return upstreamError(request, response.status, message);
  }

  const payload = await response.json();
  const result = normalizeFxRateSyncResult(payload);
  if (result === null) {
    return upstreamError(request, 502, "Unexpected fx rate sync payload");
  }

  const out = NextResponse.json(result);
  await attachSessionCookie(out, authSession, session);
  return out;
}
