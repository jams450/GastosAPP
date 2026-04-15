import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";
import { validateTransferPayload } from "@/lib/contracts/transactions";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const validation = validateTransferPayload(body);
  if (!validation.ok) {
    return NextResponse.json({ message: validation.message }, { status: 400 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/transactions/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(validation.data),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return NextResponse.json(
      { message: errorBody?.message ?? errorBody?.Message ?? "Failed to create transfer transaction" },
      { status: response.status }
    );
  }

  const result = await response.json();
  return NextResponse.json(result, { status: response.status });
}
