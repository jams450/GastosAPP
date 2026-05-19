import { NextResponse } from "next/server";

type ErrorCode = "UNAUTHORIZED" | "SESSION_EXPIRED" | "FORBIDDEN" | "BAD_REQUEST" | "UPSTREAM_ERROR";

type ErrorPayload = {
  code: ErrorCode;
  message: string;
  traceId: string;
};

export function getTraceId(request?: Request): string {
  const fromHeader = request?.headers.get("x-request-id") ?? request?.headers.get("x-correlation-id");
  return fromHeader?.trim() || crypto.randomUUID();
}

export function errorResponse(status: number, payload: ErrorPayload) {
  return NextResponse.json(payload, { status });
}

export function unauthorized(request?: Request, message = "Unauthorized") {
  return errorResponse(401, { code: "UNAUTHORIZED", message, traceId: getTraceId(request) });
}

export function sessionExpired(request?: Request, message = "Session expired") {
  return errorResponse(401, { code: "SESSION_EXPIRED", message, traceId: getTraceId(request) });
}

export function forbidden(request?: Request, message = "Forbidden") {
  return errorResponse(403, { code: "FORBIDDEN", message, traceId: getTraceId(request) });
}

export function badRequest(request: Request | undefined, message: string) {
  return errorResponse(400, { code: "BAD_REQUEST", message, traceId: getTraceId(request) });
}

export function upstreamError(request: Request | undefined, status: number, message: string) {
  const code: ErrorCode = status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FORBIDDEN" : "UPSTREAM_ERROR";
  return errorResponse(status, { code, message, traceId: getTraceId(request) });
}
