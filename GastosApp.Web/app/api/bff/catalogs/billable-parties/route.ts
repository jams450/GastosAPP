import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";
import { normalizeBillableParties } from "@/lib/contracts/billable-parties";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const onlyActive = searchParams.get("onlyActive");
  const query = onlyActive ? `?onlyActive=${encodeURIComponent(onlyActive)}` : "";
  const response = await fetch(`${getApiBaseUrl()}/api/BillableParties${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch billable parties";
    return NextResponse.json({ message }, { status: response.status });
  }

  const payload = await response.json();
  return NextResponse.json(normalizeBillableParties(payload));
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const response = await fetch(`${getApiBaseUrl()}/api/BillableParties`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const raw = await response.text();
  return new NextResponse(raw, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
}
