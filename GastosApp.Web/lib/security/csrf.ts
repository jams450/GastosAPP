import { NextResponse } from "next/server";
import { SESSION_COOKIE_SECURE } from "@/lib/auth/session";

export const CSRF_HEADER_NAME = "x-csrf-token";
export const CSRF_COOKIE_NAME = SESSION_COOKIE_SECURE ? "__Host-gastos_csrf" : "gastos_csrf_dev";

export function issueCsrfToken(response: NextResponse, expiresAt: string) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: token,
    httpOnly: false,
    secure: SESSION_COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt)
  });
}

export function clearCsrfToken(response: NextResponse) {
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: "",
    httpOnly: false,
    secure: SESSION_COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  });
}

export function isMutatingMethod(method: string) {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

export function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const trusted = (process.env.CSRF_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (trusted.length > 0) {
    return trusted.includes(origin);
  }

  return origin === new URL(request.url).origin;
}
