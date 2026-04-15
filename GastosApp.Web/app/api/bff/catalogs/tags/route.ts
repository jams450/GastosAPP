import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";
import { validateTagPayload } from "@/lib/contracts/catalogs";
import { normalizeTags } from "@/lib/contracts/tags";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/tags`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch tags";
    return NextResponse.json({ message }, { status: response.status });
  }

  const payload = await response.json();
  return NextResponse.json(normalizeTags(payload));
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const input = await request.json();
  const validation = validateTagPayload(input);
  if (!validation.ok) {
    return NextResponse.json({ message: validation.message }, { status: 400 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/tags`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(validation.data),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return NextResponse.json(
      { message: body?.message ?? body?.Message ?? "Failed to create tag" },
      { status: response.status }
    );
  }

  const result = await response.json();
  return NextResponse.json(result, { status: response.status });
}
