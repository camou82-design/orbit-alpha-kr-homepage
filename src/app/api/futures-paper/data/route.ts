import { NextResponse } from "next/server";
import { loadFuturesPaperDataBundle } from "@/lib/futuresPaperRead";
import { verifyAdminSessionRequest } from "@/lib/auth/homepageAdminSession";

export const runtime = "nodejs";

/**
 * Read-only JSON bundle for /futures-paper.
 * Defense-in-depth: Requires valid signed admin session.
 */
export async function GET(req: Request) {
  const isAuthorized = await verifyAdminSessionRequest(req);
  if (!isAuthorized) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized: Valid signed admin session required." },
      { status: 401 }
    );
  }

  const bundle = await loadFuturesPaperDataBundle();
  return NextResponse.json(bundle);
}
