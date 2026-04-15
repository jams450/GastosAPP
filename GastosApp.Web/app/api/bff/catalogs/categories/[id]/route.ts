import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";
import { validateCategoryPayload } from "@/lib/contracts/catalogs";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const categoryId = parseId(id);
  if (!categoryId) {
    return NextResponse.json({ message: "Invalid category id" }, { status: 400 });
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const input = await request.json();
  const validation = validateCategoryPayload(input);
  if (!validation.ok) {
    return NextResponse.json({ message: validation.message }, { status: 400 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/categories/${categoryId}`, {
    method: "PUT",
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
      { message: body?.message ?? body?.Message ?? "Failed to update category" },
      { status: response.status }
    );
  }

  const result = await response.json();
  return NextResponse.json(result, { status: response.status });
}
