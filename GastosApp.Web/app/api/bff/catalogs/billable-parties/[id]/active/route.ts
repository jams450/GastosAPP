import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const input = (await request.json().catch(() => null)) as { active?: unknown } | null;
  const active = typeof input?.active === "boolean" ? input.active : null;
  if (active === null) {
    return NextResponse.json({ message: "active must be boolean" }, { status: 400 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/BillableParties/${encodeURIComponent(id)}/active`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(active),
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
