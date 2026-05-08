import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";

function isAdmin(role?: string) {
  return (role ?? "").toLowerCase() === "admin";
}

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (!id) return NextResponse.json({ message: "Id inválido" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { active?: unknown } | null;
  if (!body || typeof body.active !== "boolean") {
    return NextResponse.json({ message: "Payload inválido" }, { status: 400 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/users/${id}/active`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body.active)
  });

  const raw = await response.text();
  return new NextResponse(raw, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
}
