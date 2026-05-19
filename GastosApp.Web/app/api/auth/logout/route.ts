import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiBaseUrl } from "@/lib/api/config";
import { decryptSession, SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE } from "@/lib/auth/session";
import { getTraceId } from "@/lib/bff/http";

export async function POST(request: Request) {
  const traceId = getTraceId(request);
  const cookieStore = await cookies();
  const encrypted = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (encrypted) {
    const session = await decryptSession(encrypted);
    if (session?.refreshToken) {
      await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
        cache: "no-store"
      }).catch(() => null);
    }
  }

  const response = NextResponse.json({ ok: true, code: "LOGGED_OUT", traceId });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: SESSION_COOKIE_SECURE
  });
  console.info("[bff.auth.logout]", { traceId });

  return response;
}
