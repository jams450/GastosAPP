import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeResolvedFxRate } from "@/lib/contracts/currencies";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") ?? "").trim().toUpperCase();
  const date = (searchParams.get("date") ?? "").trim();

  if (currency.length !== 3) {
    return badRequest(request, "currency must be a three-letter ISO 4217 code");
  }
  if (date && !ISO_DATE.test(date)) {
    return badRequest(request, "date must be yyyy-MM-dd");
  }

  const query = new URLSearchParams({ currency });
  if (date) {
    query.set("date", date);
  }

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/FxRates/rate?${query.toString()}`, {
    method: "GET",
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    if (response.status === 404) {
      return upstreamError(request, 404, "No fx rate is available for that currency and date");
    }

    const message = response.status === 401 ? "Session expired" : "Failed to fetch the fx rate";
    return upstreamError(request, response.status, message);
  }

  const payload = await response.json();
  const rate = normalizeResolvedFxRate(payload);
  if (rate === null) {
    // Se rechaza en lugar de devolver una tasa incompleta: el consumidor convertiría con datos inválidos.
    return upstreamError(request, 502, "Unexpected fx rate payload");
  }

  const out = NextResponse.json(rate);
  await attachSessionCookie(out, authSession, session);
  return out;
}
