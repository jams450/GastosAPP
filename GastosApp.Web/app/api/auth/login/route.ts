import { decodeJwt } from "jose";
import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { encryptSession, SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE } from "@/lib/auth/session";

type LoginRequest = {
  username: string;
  password: string;
};

type ApiLoginResponse = {
  token: string;
  expiration: string;
  username: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as LoginRequest;

  if (!body.username || !body.password) {
    return NextResponse.json({ message: "Username and password are required" }, { status: 400 });
  }

  const apiResponse = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: body.username, password: body.password }),
    cache: "no-store"
  });

  if (!apiResponse.ok) {
    return NextResponse.json({ message: "Invalid credentials" }, { status: apiResponse.status });
  }

  const loginData = (await apiResponse.json()) as ApiLoginResponse;
  const claims = decodeJwt(loginData.token);
  const idRaw =
    claims.sub ??
    claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"];
  const userId = Number(idRaw);
  if (!idRaw || Number.isNaN(userId)) {
    return NextResponse.json({ message: "Token does not include a valid user id claim" }, { status: 401 });
  }

  const role = String(claims["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"]);

  const sessionToken = await encryptSession({
    accessToken: loginData.token,
    expiresAt: loginData.expiration,
    user: {
      id: userId,
      username: loginData.username,
      role
    }
  });

  const response = NextResponse.json({ user: { id: userId, username: loginData.username, role : role } });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    expires: new Date(loginData.expiration)
  });

  return response;
}
