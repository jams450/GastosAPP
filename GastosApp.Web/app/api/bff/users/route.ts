import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";
import { normalizeUsers } from "@/lib/contracts/users-admin";

function isAdmin(role?: string) {
  return (role ?? "").toLowerCase() === "admin";
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const response = await fetch(`${getApiBaseUrl()}/api/users`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return NextResponse.json({ message: body?.message ?? body?.Message ?? "Failed to load users" }, { status: response.status });
  }

  const raw = await response.json();
  return NextResponse.json(normalizeUsers(raw));
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const response = await fetch(`${getApiBaseUrl()}/api/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  return new NextResponse(raw, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
}
