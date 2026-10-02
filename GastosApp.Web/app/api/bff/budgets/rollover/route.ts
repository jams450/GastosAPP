import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeBudgetRollover } from "@/lib/contracts/budgets";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ROLLOVER_MODES = ["copy", "remount", "copy-and-remount"] as const;

/**
 * El 400 y el 409 del rollover no son errores de transporte: el 400 es la validación de periodos o
 * modo del propio API y el 409 es "el mes destino ya tiene plan". Los dos viajan verbatim porque su
 * motivo es más útil que un texto genérico, igual que en `recurring-items/from-transaction`.
 */
const FORWARDED_STATUSES = new Set([400, 409]);

function periodKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return PERIOD_PATTERN.test(trimmed) ? trimmed : null;
}

/** Modo ausente = `copy-and-remount`, que es lo que aplica el backend ante un `mode` vacío. */
function rolloverMode(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return "copy-and-remount";
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return (ROLLOVER_MODES as readonly string[]).includes(normalized) ? normalized : null;
}

/**
 * Ausente significa `true`, la misma regla del backend: "sin confirmación explícita no se escribe
 * nada". Un `dryRun` no booleano — incluido un `null` explícito, que es "presente pero inválido" —
 * se rechaza en vez de convertirse en `true` o en `false`.
 */
function dryRunFlag(value: unknown): boolean | null {
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

  const fromPeriod = periodKey(record?.fromPeriod ?? record?.FromPeriod);
  if (fromPeriod === null) {
    return badRequest(request, "fromPeriod must use yyyy-MM format");
  }

  const toPeriod = periodKey(record?.toPeriod ?? record?.ToPeriod);
  if (toPeriod === null) {
    return badRequest(request, "toPeriod must use yyyy-MM format");
  }

  // Orden lexicográfico: `yyyy-MM` ya ordena igual que la cronología.
  if (toPeriod <= fromPeriod) {
    return badRequest(request, "toPeriod must be later than fromPeriod");
  }

  const mode = rolloverMode(record?.mode ?? record?.Mode);
  if (mode === null) {
    return badRequest(request, "mode must be one of: copy, remount, copy-and-remount");
  }

  // `??` convertiría un `dryRun: null` en "ausente" y lo dejaría pasar como `true`; la presencia se
  // decide por `undefined`, que es lo único que significa "no vino en el cuerpo".
  const rawDryRun = record?.dryRun !== undefined ? record.dryRun : record?.DryRun;
  const dryRun = dryRunFlag(rawDryRun);
  if (dryRun === null) {
    return badRequest(request, "dryRun must be a boolean");
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/budgets/rollover`, {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ fromPeriod, toPeriod, mode, dryRun })
  });

  if (!response.ok && !FORWARDED_STATUSES.has(response.status)) {
    const message = response.status === 401 ? "Session expired" : "Failed to roll over the budget plan";
    const out = upstreamError(request, response.status, message);
    await attachSessionCookie(out, updatedSession, session);
    return out;
  }

  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "application/json";

  if (!response.ok) {
    // 400/409 con el `{ Message }` del API: la UI lo muestra como motivo, no lo reemplaza.
    const out = new NextResponse(raw, { status: response.status, headers: { "content-type": contentType } });
    await attachSessionCookie(out, updatedSession, session);
    return out;
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Un 200 sin cuerpo legible se responde normalizado en vacío: la pantalla ve "no hay nada que
    // clonar" en vez de romperse con una respuesta no parseable.
    payload = null;
  }

  const out = NextResponse.json(normalizeBudgetRollover(payload), { status: response.status });
  await attachSessionCookie(out, updatedSession, session);
  return out;
}
