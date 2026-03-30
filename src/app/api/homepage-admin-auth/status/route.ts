import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "homepage_admin_auth";

export async function GET() {
  const cookieStore = await cookies();
  const v = cookieStore.get(COOKIE_NAME)?.value;
  const authed = v === "authenticated";
  return NextResponse.json({ ok: true, authed });
}

