import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { loadFuturesPaperDataBundle } from "@/lib/futuresPaperRead";

export const runtime = "nodejs";

const COOKIE_NAME = "homepage_admin_auth";

/**
 * Read-only JSON bundle from orbitalpha-futures-paper `data/` on the server.
 * No trading / no Upbit — filesystem read only.
 * Requires same homepage admin session as /admin-login (Blog Automation).
 */
export async function GET() {
  const cookieStore = await cookies();
  if (cookieStore.get(COOKIE_NAME)?.value !== "authenticated") {
    return NextResponse.json({ ok: false, error: "관리자 로그인 필요" }, { status: 401 });
  }
  const bundle = await loadFuturesPaperDataBundle();
  return NextResponse.json(bundle);
}
