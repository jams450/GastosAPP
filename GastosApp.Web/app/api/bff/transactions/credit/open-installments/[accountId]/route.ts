import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { normalizeCreditOpenInstallments } from "@/lib/contracts/transactions";

type Params = { params: Promise<{ accountId: string }> };

function parsePositiveId(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(_request: Request, { params }: Params) {
  const { accountId } = await params;
  const parsedAccountId = parsePositiveId(accountId);
  if (!parsedAccountId) {
    return NextResponse.json({ message: "Invalid account id" }, { status: 400 });
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let authSession = session;

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/transactions/credit/${parsedAccountId}/open-installments`, {
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return NextResponse.json({ message: body?.message ?? body?.Message ?? "Failed to load open installments" }, { status: response.status });
  }

  const data = await response.json();
  const out = NextResponse.json(normalizeCreditOpenInstallments(data));
  await attachSessionCookie(out, authSession, session);
  return out;
}
