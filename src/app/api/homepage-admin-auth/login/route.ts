import { NextResponse } from "next/server";
import { createSignedAdminSession, ADMIN_COOKIE_NAME } from "@/lib/auth/homepageAdminSession";

function sanitizeReturnTo(returnTo: unknown): string {
  const v = typeof returnTo === "string" ? returnTo : "/";
  if (!v.startsWith("/")) return "/";
  return v;
}

export async function POST(req: Request) {
  const body: { password?: unknown; returnTo?: unknown } = await req.json().catch(() => ({}));
  const password = String(body.password ?? "").trim();
  const returnTo = sanitizeReturnTo(body.returnTo);

  const expected = (process.env.HOMEPAGE_ADMIN_PASSWORD?.trim() || "955104").trim();
  if (password !== expected) {
    return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const sessionToken = await createSignedAdminSession();
  if (!sessionToken) {
    return NextResponse.json(
      { ok: false, error: "서버 세션 키(ADMIN_SESSION_SECRET)가 설정되지 않아 세션 생성이 차단되었습니다." },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true, redirectTo: returnTo });
  res.cookies.set(ADMIN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600
  });

  return res;
}
