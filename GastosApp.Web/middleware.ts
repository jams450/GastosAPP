import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { decryptSession, isSessionUsable, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getTraceId } from "@/lib/bff/http";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, isCsrfEnforced, isMutatingMethod, isTrustedOrigin } from "@/lib/security/csrf";

const privateRoutes = ["/dashboard", "/accounts", "/transactions", "/catalogs", "/users"];

function redirectToLogin(request: NextRequest) {
  const url = new URL("/login", request.url);
  url.searchParams.set("reason", "session_expired");
  const response = NextResponse.redirect(url);
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(CSRF_COOKIE_NAME);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isCsrfEnforced() && (pathname.startsWith("/api/bff/") || pathname === "/api/auth/logout") && isMutatingMethod(request.method)) {
    const traceId = getTraceId(request);
    const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
    const headerToken = request.headers.get(CSRF_HEADER_NAME);
    const trustedOrigin = isTrustedOrigin(request);

    if (!trustedOrigin || !cookieToken || !headerToken || cookieToken !== headerToken) {
      return NextResponse.json(
        { code: "CSRF_REJECTED", message: "CSRF validation failed", traceId },
        { status: 403 }
      );
    }
  }

  const rawCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const hasSessionCookie = Boolean(rawCookie);
  const session = rawCookie ? await decryptSession(rawCookie) : null;
  const hasUsableSession = Boolean(session && isSessionUsable(session));

  if (privateRoutes.some((route) => pathname.startsWith(route))) {
    if (!hasSessionCookie || !hasUsableSession) {
      return redirectToLogin(request);
    }
    return NextResponse.next();
  }

  const reason = request.nextUrl.searchParams.get("reason");
  if (pathname.startsWith("/login") && reason === "session_expired") {
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE_NAME);
    response.cookies.delete(CSRF_COOKIE_NAME);
    return response;
  }

  if (pathname.startsWith("/login") && hasSessionCookie && hasUsableSession) {
    const url = new URL("/dashboard", request.url);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/login") && hasSessionCookie && !hasUsableSession) {
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE_NAME);
    response.cookies.delete(CSRF_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/accounts/:path*",
    "/transactions/:path*",
    "/catalogs/:path*",
    "/users/:path*",
    "/api/bff/:path*",
    "/api/auth/logout"
  ]
};
