import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { validateCategoryPayload } from "@/lib/contracts/catalogs";
import { normalizeCategories } from "@/lib/contracts/categories";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let authSession = session;
  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/categories`, {
    method: "GET",
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const message = response.status === 401 ? "Session expired" : "Failed to fetch categories";
    return NextResponse.json({ message }, { status: response.status });
  }

  const payload = await response.json();
  const out = NextResponse.json(normalizeCategories(payload));
  await attachSessionCookie(out, authSession, session);
  return out;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const input = await request.json();
  const validation = validateCategoryPayload(input);
  if (!validation.ok) {
    return NextResponse.json({ message: validation.message }, { status: 400 });
  }

  const call = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/categories`, {
    method: "POST",
    body: JSON.stringify(validation.data),
    cache: "no-store"
  });
  const response = call.response;
  authSession = call.session;

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return NextResponse.json(
      { message: body?.message ?? body?.Message ?? "Failed to create category" },
      { status: response.status }
    );
  }

  const result = await response.json();
  const out = NextResponse.json(result, { status: response.status });
  await attachSessionCookie(out, authSession, session);
  return out;
}
  let authSession = session;
