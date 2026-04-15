import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const tagId = parseId(id);
  if (!tagId) {
    return NextResponse.json({ message: "Invalid tag id" }, { status: 400 });
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const input = (await request.json().catch(() => null)) as { active?: unknown } | null;
  const active = typeof input?.active === "boolean" ? input.active : null;
  if (active === null) {
    return NextResponse.json({ message: "active must be boolean" }, { status: 400 });
  }

  const currentTagResponse = await fetch(`${getApiBaseUrl()}/api/tags/${tagId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!currentTagResponse.ok) {
    const body = (await currentTagResponse.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return NextResponse.json(
      { message: body?.message ?? body?.Message ?? "Failed to retrieve current tag" },
      { status: currentTagResponse.status }
    );
  }

  const currentTag = (await currentTagResponse.json()) as { name?: unknown };
  const name = typeof currentTag.name === "string" ? currentTag.name.trim() : "";
  if (!name) {
    return NextResponse.json({ message: "Invalid current tag payload" }, { status: 500 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/tags/${tagId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name, active }),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return NextResponse.json({ message: body?.message ?? body?.Message ?? "Failed to update tag status" }, { status: response.status });
  }

  const result = await response.json();
  return NextResponse.json(result, { status: response.status });
}
