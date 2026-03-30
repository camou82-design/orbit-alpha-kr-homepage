import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "homepage_admin_auth";

function sanitizeReturnTo(returnTo: unknown): string {
  const v = typeof returnTo === "string" ? returnTo : "/";
  if (!v.startsWith("/")) return "/";
  return v;
}

export async function POST(req: Request) {
  const body: { password?: unknown; returnTo?: unknown } = await req.json().catch(() => ({}));
  const password = String(body.password ?? "").trim();
  const returnTo = sanitizeReturnTo(body.returnTo);

  // Homepage-only admin login (namespaced cookie: homepage_admin_auth).
  // Intentionally NOT shared with JJ/trading admin auth to avoid cross-service coupling.
  const HOMEPAGE_ADMIN_PASSWORD = (process.env.HOMEPAGE_ADMIN_PASSWORD ?? "955104").trim();
  if (password !== HOMEPAGE_ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, redirectTo: returnTo });
  res.cookies.set(COOKIE_NAME, "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Session cookie: cleared when browser session ends (prevents "permanent" pass-through).
  });

  return res;
}

