import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";
import { normalizeDashboardCreditOverview } from "@/lib/contracts/dashboard";

export async function GET(request: NextRequest) {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const month = request.nextUrl.searchParams.get("month");
  const query = month ? `?month=${encodeURIComponent(month)}` : "";

  const response = await fetch(`${getApiBaseUrl()}/api/dashboard/credit-overview${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch dashboard data";
    return NextResponse.json({ message }, { status: response.status });
  }

  const raw = await response.json();
  const dashboard = normalizeDashboardCreditOverview(raw);

  return NextResponse.json(dashboard);
}
