import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let authSession = session;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "Payload inválido" }, { status: 400 });
  }

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/transactions/credit/opening-charges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  const data = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
  if (!response.ok) {
    return NextResponse.json(
      { message: data?.message ?? data?.Message ?? "No se pudieron crear cargos de apertura" },
      { status: response.status }
    );
  }

  const out = NextResponse.json(data ?? { message: "Cargos de apertura creados" }, { status: 200 });
  await attachSessionCookie(out, authSession, session);
  return out;
}
