import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { decryptSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE } from "@/lib/auth/session";

export async function POST(request: Request) {
  const encrypted = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(`${SESSION_COOKIE_NAME}=`.length);

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

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: SESSION_COOKIE_SECURE
  });

  return response;
}
