import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const response = await fetch(`${getApiBaseUrl()}/api/accounts/${encodeURIComponent(id)}`, {
    method: "PUT",
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
