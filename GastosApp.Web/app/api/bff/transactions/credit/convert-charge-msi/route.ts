import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";

type Payload = {
  sourceTransactionId?: unknown;
  months?: unknown;
};

function parsePositiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Payload | null;
  const sourceTransactionId = parsePositiveInt(body?.sourceTransactionId);
  const months = parsePositiveInt(body?.months);

  if (!sourceTransactionId || !months || months < 2 || months > 60) {
    return NextResponse.json({ message: "sourceTransactionId and months(2..60) are required" }, { status: 400 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/transactions/credit/convert-charge-msi`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sourceTransactionId, months }),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return NextResponse.json(
      { message: errorBody?.message ?? errorBody?.Message ?? "Failed to convert charge to MSI" },
      { status: response.status }
    );
  }

  const result = await response.json().catch(() => ({}));
  return NextResponse.json(result, { status: response.status });
}
