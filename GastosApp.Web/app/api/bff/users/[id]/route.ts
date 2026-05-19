import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";

function isAdmin(role?: string) {
  return (role ?? "").toLowerCase() === "admin";
}

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  let authSession = session;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (!id) return NextResponse.json({ message: "Id inválido" }, { status: 400 });

  const body = await request.json();
  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const response = call.response;
  authSession = call.session;

  const raw = await response.text();
  const out = new NextResponse(raw, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
  await attachSessionCookie(out, authSession, session);
  return out;
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  let authSession = session;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (!id) return NextResponse.json({ message: "Id inválido" }, { status: 400 });

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/users/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" }
  });
  const response = call.response;
  authSession = call.session;

  const raw = await response.text();
  const out = new NextResponse(raw, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
  await attachSessionCookie(out, authSession, session);
  return out;
}
