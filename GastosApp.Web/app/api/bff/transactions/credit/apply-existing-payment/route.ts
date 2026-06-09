import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";

// TODO: Validar si este flujo/endpoint sigue siendo necesario. La UI web ya no expone "Aplicar pago" porque ingresos/transferencias a crédito asignan mensualidades al crear la transacción.

type Payload = {
  sourceTransactionId: number;
  creditAccountId: number;
  amount?: number;
};

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const body = (await request.json().catch(() => null)) as Payload | null;
  if (!body || !Number.isFinite(body.sourceTransactionId) || !Number.isFinite(body.creditAccountId)) {
    return badRequest(request, "Payload inválido");
  }

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/transactions/credit/apply-existing-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  const data = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
  if (!response.ok) {
    return upstreamError(request, response.status, data?.message ?? data?.Message ?? "No se pudo aplicar pago existente");
  }

  const out = NextResponse.json(data ?? { message: "Pago aplicado" }, { status: 200 });
  await attachSessionCookie(out, authSession, session);
  return out;
}
