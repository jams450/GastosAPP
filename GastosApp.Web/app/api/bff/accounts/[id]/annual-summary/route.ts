import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized } from "@/lib/bff/http";

type Params = { params: Promise<{ id: string }> };

const YEAR_PATTERN = /^\d{4}$/;
const ACCOUNT_ID_PATTERN = /^\d+$/;

export async function GET(request: Request, { params }: Params) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }
  let authSession = session;

  const { id } = await params;
  if (!ACCOUNT_ID_PATTERN.test(id)) {
    return badRequest(request, "id must be a numeric account id");
  }

  const { searchParams } = new URL(request.url);
  const year = (searchParams.get("year") ?? "").trim();
  if (year.length > 0 && !YEAR_PATTERN.test(year)) {
    return badRequest(request, "year must use YYYY format");
  }

  // El año es opcional: sin `?year=` el backend resuelve el año en curso.
  const query = year.length > 0 ? `?year=${encodeURIComponent(year)}` : "";

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/accounts/${id}/annual-summary${query}`, {
    method: "GET",
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
