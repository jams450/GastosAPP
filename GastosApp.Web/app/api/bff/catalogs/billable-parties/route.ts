import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { normalizeBillableParties } from "@/lib/contracts/billable-parties";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let authSession = session;

  const { searchParams } = new URL(request.url);
  const onlyActive = searchParams.get("onlyActive");
  const query = onlyActive ? `?onlyActive=${encodeURIComponent(onlyActive)}` : "";
  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/BillableParties${query}`, {
    method: "GET",
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch billable parties";
    return NextResponse.json({ message }, { status: response.status });
  }

  const payload = await response.json();
  const out = NextResponse.json(normalizeBillableParties(payload));
  await attachSessionCookie(out, authSession, session);
  return out;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let authSession = session;

  const body = await request.json();
  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/BillableParties`, {
    method: "POST",
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  const raw = await response.text();
  const out = new NextResponse(raw, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
  await attachSessionCookie(out, authSession, session);
  return out;
}
