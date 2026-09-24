import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminSessionToken, ADMIN_COOKIE_NAME } from "@/lib/auth/homepageAdminSession";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const authed = await verifyAdminSessionToken(token);
  return NextResponse.json({ ok: true, authed });
}
