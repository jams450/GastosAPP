import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";
import { normalizeAccounts } from "@/lib/contracts/accounts";

export async function GET() {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/accounts`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch accounts";
    return NextResponse.json({ message }, { status: response.status });
  }

  const rawAccounts = await response.json();
  const accounts = normalizeAccounts(rawAccounts);

  return NextResponse.json(accounts);
}
