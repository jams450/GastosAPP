import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";

type Params = { params: Promise<{ groupId: string }> };

function mapErrorMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) {
    return fallback;
  }

  const value = body as { message?: string; Message?: string };
  return value.message ?? value.Message ?? fallback;
}

function isValidGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function PUT(request: Request, { params }: Params) {
  const { groupId } = await params;
  if (!isValidGuid(groupId)) {
    return NextResponse.json({ message: "Invalid transfer group id" }, { status: 400 });
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/transactions/transfer/${groupId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    return NextResponse.json(
      { message: mapErrorMessage(errorBody, "Failed to update transfer") },
      { status: response.status }
    );
  }

  const result = await response.json().catch(() => ({}));
  return NextResponse.json(result, { status: response.status });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { groupId } = await params;
  if (!isValidGuid(groupId)) {
    return NextResponse.json({ message: "Invalid transfer group id" }, { status: 400 });
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/transactions/transfer/${groupId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    return NextResponse.json(
      { message: mapErrorMessage(errorBody, "Failed to delete transfer") },
      { status: response.status }
    );
  }

  const result = await response.json().catch(() => ({}));
  return NextResponse.json(result, { status: response.status });
}
