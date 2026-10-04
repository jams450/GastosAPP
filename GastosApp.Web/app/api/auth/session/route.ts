import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession, SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE } from "@/lib/auth/session";
import { validateSession } from "@/lib/auth/session-validation";
import { clearCsrfToken } from "@/lib/security/csrf";

export async function GET() {
  try {
    const original = await getServerSession();
    // AccountsController uses UserWithId; never send account data to browser.
    const result = await validateSession(original, (session) => fetchApiWithAutoRefresh(
      session, `${getApiBaseUrl()}/api/accounts/active`, {
        method: "GET", cache: "no-store", signal: AbortSignal.timeout(10_000)
      }
    ));
    const session = result.session;
    const status = result.status === 200 && session && (session.user.role ?? "").toLowerCase() !== "admin" ? 403 : result.status;
    const response = NextResponse.json({
      authenticated: status === 503 ? null : status === 200,
      ...(status === 200 && session ? { user: session.user, expiresAt: session.expiresAt } : {})
    }, {
      status, headers: { "Cache-Control": "no-store", ...(status === 503 ? { "Retry-After": "3" } : {}) }
    });
    if (status === 401) {
      response.cookies.set({
        name: SESSION_COOKIE_NAME, value: "", path: "/", expires: new Date(0),
        httpOnly: true, sameSite: "lax", secure: SESSION_COOKIE_SECURE
      });
      clearCsrfToken(response);
    } else if (session && original) {
      await attachSessionCookie(response, session, original);
    }
    return response;
  } catch {
    return NextResponse.json({ authenticated: null }, {
      status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "3" }
    });
  }
}
