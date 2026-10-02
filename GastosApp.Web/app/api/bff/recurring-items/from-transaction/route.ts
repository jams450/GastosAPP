import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeRecurringItemFromTransaction } from "@/lib/contracts/recurring-items";

/**
 * El 409 de `from-transaction` no es un error de transporte: es el resultado del guardado, con la
 * plantilla existente en el cuerpo (`{ dryRun, written, conflict, existing }`). Por eso esos tres
 * códigos se reenvían tal cual para que el diálogo ofrezca "ya existe" en vez de duplicar. El 400 y
 * el 404 también viajan verbatim: el motivo del backend es más útil que un texto genérico.
 */
const FORWARDED_STATUSES = new Set([400, 404, 409]);

/** Entero positivo o `null`. Los booleanos no son ids: `Number(false)` es `0` y `Number(true)` es `1`. */
function parseTransactionId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Ausente significa `true`: la propuesta sola no escribe nada (sección 8.7). */
function parseDryRun(value: unknown): boolean | null {
  if (value === undefined) {
    return true;
  }

  return typeof value === "boolean" ? value : null;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }

  const body = await request.json().catch(() => null);
  const record = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;

  const transactionId = record ? parseTransactionId(record.transactionId) : null;
  if (transactionId === null) {
    return badRequest(request, "transactionId must be a positive integer");
  }

  const dryRun = parseDryRun(record?.dryRun);
  if (dryRun === null) {
    return badRequest(request, "dryRun must be a boolean");
  }

  let authSession = session;
  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/recurring-items/from-transaction`, {
    method: "POST",
    body: JSON.stringify({ transactionId, dryRun }),
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok && !FORWARDED_STATUSES.has(response.status)) {
    const message = response.status === 401 ? "Session expired" : "Failed to schedule the transaction";
    const out = upstreamError(request, response.status, message);
    await attachSessionCookie(out, authSession, session);
    return out;
  }

  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "application/json";

  if (!response.ok) {
    const out = new NextResponse(raw, { status: response.status, headers: { "content-type": contentType } });
    await attachSessionCookie(out, authSession, session);
    return out;
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Un 200 sin cuerpo legible se responde normalizado en vacío: el diálogo muestra el error de
    // "sin propuesta" en vez de romper el render con una respuesta no parseable.
    payload = null;
  }

  const out = NextResponse.json(normalizeRecurringItemFromTransaction(payload), { status: response.status });
  await attachSessionCookie(out, authSession, session);
  return out;
}
