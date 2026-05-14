import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { decryptSession, isSessionUsable, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const privateRoutes = ["/dashboard", "/accounts", "/transactions", "/catalogs", "/users"];

function redirectToLogin(request: NextRequest) {
  const url = new URL("/login", request.url);
  const response = NextResponse.redirect(url);
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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

  if (pathname.startsWith("/login") && hasSessionCookie && hasUsableSession) {
    const url = new URL("/dashboard", request.url);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/login") && hasSessionCookie && !hasUsableSession) {
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/accounts/:path*", "/transactions/:path*", "/catalogs/:path*", "/users/:path*"]
};
