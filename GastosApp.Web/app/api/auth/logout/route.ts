import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE } from "@/lib/auth/session";

export async function POST() {
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
