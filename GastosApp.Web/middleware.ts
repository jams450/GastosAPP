import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

const privateRoutes = ["/dashboard", "/transactions", "/catalogs"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (privateRoutes.some((route) => pathname.startsWith(route)) && !hasSessionCookie) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/login") && hasSessionCookie) {
    const url = new URL("/dashboard", request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/transactions/:path*", "/catalogs/:path*"]
};
