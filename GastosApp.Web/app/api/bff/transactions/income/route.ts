import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized, upstreamError } from "@/lib/bff/http";
import { validateIncomeExpensePayload } from "@/lib/contracts/transactions";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }

  const body = await request.json();
  const validation = validateIncomeExpensePayload(body);
  if (!validation.ok) {
    return badRequest(request, validation.message);
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/transactions/income`, {
    method: "POST",
    body: JSON.stringify(validation.data),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    const result = upstreamError(request, response.status, errorBody?.message ?? errorBody?.Message ?? "Failed to create income transaction");
    await attachSessionCookie(result, updatedSession, session);
    return result;
  }

  const result = await response.json();
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, updatedSession, session);
  return out;
}
