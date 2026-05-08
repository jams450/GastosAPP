import { decodeJwt } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { decryptSession, encryptSession, SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE } from "@/lib/auth/session";

type ApiRefreshResponse = {
  token: string;
  expiration: string;
  username: string;
  refreshToken?: string;
  refreshTokenExpiration?: string;
};

export async function POST() {
  const cookieStore = await cookies();
  const encrypted = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!encrypted) {
    return NextResponse.json({ message: "No active session" }, { status: 401 });
  }

  const session = await decryptSession(encrypted);
  if (!session?.refreshToken) {
    return NextResponse.json({ message: "Session has no refresh token" }, { status: 401 });
  }

  const apiResponse = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
    cache: "no-store"
  });

  if (!apiResponse.ok) {
    return NextResponse.json({ message: "Unable to refresh session" }, { status: apiResponse.status });
  }

  const refreshData = (await apiResponse.json()) as ApiRefreshResponse;
  const claims = decodeJwt(refreshData.token);
  const idRaw = claims.sub ?? claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"];
  const userId = Number(idRaw);
  if (!idRaw || Number.isNaN(userId)) {
    return NextResponse.json({ message: "Token does not include a valid user id claim" }, { status: 401 });
  }

  const role = String(claims["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"]);
  const sessionToken = await encryptSession({
    accessToken: refreshData.token,
    expiresAt: refreshData.expiration,
    refreshToken: refreshData.refreshToken,
    refreshExpiresAt: refreshData.refreshTokenExpiration,
    user: {
      id: userId,
      username: refreshData.username,
      role
    }
  });

  const response = NextResponse.json({ user: { id: userId, username: refreshData.username, role } });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    expires: new Date(refreshData.refreshTokenExpiration ?? refreshData.expiration)
  });

  return response;
}
