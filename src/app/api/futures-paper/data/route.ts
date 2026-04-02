import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { loadFuturesPaperDataBundle } from "@/lib/futuresPaperRead";

export const runtime = "nodejs";

const COOKIE_NAME = "homepage_admin_auth";

/**
 * Read-only JSON bundle for /futures-paper.
 * Uses ORBITALPHA_FUTURES_PAPER_API_URL (Lightsail) or local ORBITALPHA_FUTURES_PAPER_ROOT (dev).
 * Requires homepage admin session (same cookie as /admin-login).
 */
export async function GET() {
  const cookieStore = await cookies();
  if (cookieStore.get(COOKIE_NAME)?.value !== "authenticated") {
    return NextResponse.json({ ok: false, error: "관리자 로그인 필요" }, { status: 401 });
  }
  const bundle = await loadFuturesPaperDataBundle();
  return NextResponse.json(bundle);
}
