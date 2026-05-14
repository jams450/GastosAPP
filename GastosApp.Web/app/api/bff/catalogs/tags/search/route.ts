import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";
import { normalizeTags } from "@/lib/contracts/tags";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const response = await fetch(`${getApiBaseUrl()}/api/tags/search?q=${encodeURIComponent(query)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to search tags";
    return NextResponse.json({ message }, { status: response.status });
  }

  const payload = await response.json();
  return NextResponse.json(normalizeTags(payload));
}
