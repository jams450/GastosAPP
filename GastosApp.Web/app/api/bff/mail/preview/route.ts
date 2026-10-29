import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";

/** Tope de tamaño del cuerpo: el módulo es de muestras, no de buzones completos. */
const MAX_RAW_BYTES = 2_000_000;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }

  const input: unknown = await request.json().catch(() => null);
  if (!isRecord(input)) {
    return badRequest(request, "Payload inválido");
  }

  const messagesInput = Array.isArray(input.messages) ? input.messages : [];
  const candidatesInput = Array.isArray(input.candidates) ? input.candidates : [];

  const messages = messagesInput
    .filter(isRecord)
    .map((message) => ({ name: toTrimmedString(message.name) || "mensaje.eml", raw: toTrimmedString(message.raw) }))
    .filter((message) => message.raw.length > 0);

  const candidates = candidatesInput
    .filter(isRecord)
    .map((candidate) => ({
      name: toTrimmedString(candidate.name) || "candidato",
      senderAddress: toTrimmedString(candidate.senderAddress) || null,
      subject: toTrimmedString(candidate.subject) || null,
      receivedAt: toTrimmedString(candidate.receivedAt) || null
    }))
    .filter((candidate) => candidate.senderAddress !== null || candidate.subject !== null);

  if (messages.length === 0 && candidates.length === 0 && toTrimmedString(input.mailbox).length === 0) {
    return badRequest(request, "Agrega al menos un correo, un candidato o un buzón");
  }

  const rawBytes = messages.reduce((total, message) => total + message.raw.length, 0);
  if (rawBytes > MAX_RAW_BYTES) {
    return badRequest(request, "La muestra es demasiado grande: reduce la cantidad de mensajes");
  }

  const maxItems = typeof input.maxItems === "number" ? input.maxItems : 50;
  const from = toTrimmedString(input.from) || null;
  const to = toTrimmedString(input.to) || null;
  const mailbox = toTrimmedString(input.mailbox) || null;

  const call = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/emailclassification/preview`, {
    method: "POST",
    body: JSON.stringify({ messages, candidates, maxItems, from, to, mailbox }),
    cache: "no-store"
  });
  const response = call.response;

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return upstreamError(request, response.status, body?.message ?? body?.Message ?? "No se pudo probar el clasificador");
  }

  const result = await response.json();
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, call.session, session);
  return out;
}
