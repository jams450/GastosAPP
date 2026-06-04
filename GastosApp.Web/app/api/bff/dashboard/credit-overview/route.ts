import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  return NextResponse.json(
    { message: "Dashboard credit-overview route removed. Use /api/bff/dashboard/overview." },
    { status: 410 }
  );
}
