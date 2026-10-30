import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession, type AuthSession } from "@/lib/auth/session";
import { forbidden, unauthorized } from "@/lib/bff/http";
import { normalizeJobError, type JobError } from "@/lib/contracts/jobs";

/**
 * Utilidades compartidas de `/api/bff/jobs/*`.
 *
 * La API de jobs es solo para administradores (S2); el BFF repite la comprobación aunque el layout
 * de la app ya exija sesión de administrador, porque una ruta BFF también se puede llamar directo.
 * El error del upstream se traduce a un cuerpo con código estable y se conserva el status HTTP
 * (409, 503), que es lo que la pantalla necesita para decidir si refresca o si puede reintentar.
 */

export function isAdminRole(role?: string): boolean {
  return (role ?? "").toLowerCase() === "admin";
}

type GuardResult = { ok: true; session: AuthSession } | { ok: false; response: NextResponse };

export async function requireJobsAdmin(request: Request): Promise<GuardResult> {
  const session = await getServerSession();
  if (!session) return { ok: false, response: unauthorized(request) };
  if (!isAdminRole(session.user.role)) return { ok: false, response: forbidden(request) };
  return { ok: true, session };
}

export type JobsUpstreamCall = {
  response: Response;
  updatedSession: AuthSession;
  originalSession: AuthSession;
};

/** Llama a la API con refresco automático del token; nunca bloquea la respuesta del navegador. */
export async function callJobsApi(
  session: AuthSession,
  path: string,
  init: RequestInit
): Promise<JobsUpstreamCall> {
  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(
    session,
    `${getApiBaseUrl()}${path}`,
    { cache: "no-store", ...init }
  );

  return { response, updatedSession, originalSession: session };
}

export async function jobsJsonResponse(
  payload: unknown,
  status: number,
  call: JobsUpstreamCall
): Promise<NextResponse> {
  const out = NextResponse.json(payload, { status });
  await attachSessionCookie(out, call.updatedSession, call.originalSession);
  return out;
}

/** Error del upstream o del propio BFF, con el código normalizado y la cookie rotada si aplica. */
export async function jobsErrorResponse(
  payload: unknown,
  status: number,
  call: JobsUpstreamCall | null
): Promise<NextResponse> {
  const error: JobError = normalizeJobError(payload, status);
  const out = NextResponse.json(error, { status });
  if (call) {
    await attachSessionCookie(out, call.updatedSession, call.originalSession);
  }
  return out;
}

/**
 * Un 2xx con un cuerpo que no respeta el contrato no se puede presentar como éxito: se responde 502
 * para que la pantalla diga "no se pudo leer" en vez de pintar ceros inventados.
 */
export function jobsMalformedResponse(message: string, call: JobsUpstreamCall): Promise<NextResponse> {
  return jobsErrorResponse({ code: "UPSTREAM_ERROR", message }, 502, call);
}

export async function readJsonOrNull(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

/** Cuerpo de error del upstream; se lee una sola vez y un cuerpo ilegible no rompe la respuesta. */
export async function readUpstreamError(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}
