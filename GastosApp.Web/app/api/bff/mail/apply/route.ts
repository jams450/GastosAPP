import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";

/**
 * El token son 32 bytes aleatorios en base64url (43 caracteres sin relleno). El tope de 128 deja
 * margen de sobra y evita reenviar cuerpos absurdos, sin convertirse en una validación del formato
 * que el backend ya hace.
 */
const MAX_TOKEN_LENGTH = 128;

/**
 * Reenvía la orden de aplicar la muestra revisada. Solo viaja el token: ni etiquetas, ni UIDs, ni
 * identificadores de la cuenta salen del servidor. El plan completo quedó guardado del lado del API
 * cuando se generó la vista previa, atado a esta persona y a esta cuenta, y se consume una vez.
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }

  const input: unknown = await request.json().catch(() => null);
  if (typeof input !== "object" || input === null) {
    return badRequest(request, "Payload inválido");
  }

  const tokenInput = (input as Record<string, unknown>).token;
  if (typeof tokenInput !== "string") {
    return badRequest(request, "El token de aplicación es obligatorio");
  }

  const token = tokenInput.trim();
  if (token.length === 0) {
    return badRequest(request, "El token de aplicación es obligatorio");
  }

  if (token.length > MAX_TOKEN_LENGTH) {
    return badRequest(request, "El token de aplicación no es válido");
  }

  const call = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/emailclassification/apply`, {
    method: "POST",
    body: JSON.stringify({ token }),
    cache: "no-store"
  });
  const response = call.response;

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return upstreamError(
      request,
      response.status,
      body?.message ?? body?.Message ?? "No se pudo aplicar la muestra al buzón"
    );
  }

  const result = await response.json();
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, call.session, session);
  return out;
}
