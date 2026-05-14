import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { validateIncomeExpensePayload } from "@/lib/contracts/transactions";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function mapErrorMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) {
    return fallback;
  }

  const value = body as { message?: string; Message?: string };
  return value.message ?? value.Message ?? fallback;
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const transactionId = parseId(id);
  if (!transactionId) {
    return NextResponse.json({ message: "Invalid transaction id" }, { status: 400 });
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validation = validateIncomeExpensePayload(body);
  if (!validation.ok) {
    return NextResponse.json({ message: validation.message }, { status: 400 });
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/transactions/${transactionId}`, {
    method: "PUT",
    body: JSON.stringify(validation.data),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const result = NextResponse.json(
      { message: mapErrorMessage(errorBody, "Failed to update transaction") },
      { status: response.status }
    );
    await attachSessionCookie(result, updatedSession, session);
    return result;
  }

  const result = await response.json();
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, updatedSession, session);
  return out;
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const transactionId = parseId(id);
  if (!transactionId) {
    return NextResponse.json({ message: "Invalid transaction id" }, { status: 400 });
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { response, session: updatedSession } = await fetchApiWithAutoRefresh(session, `${getApiBaseUrl()}/api/transactions/${transactionId}`, {
    method: "DELETE",
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const result = NextResponse.json(
      { message: mapErrorMessage(errorBody, "Failed to delete transaction") },
      { status: response.status }
    );
    await attachSessionCookie(result, updatedSession, session);
    return result;
  }

  const result = await response.json().catch(() => ({}));
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, updatedSession, session);
  return out;
}
