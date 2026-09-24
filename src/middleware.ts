import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminSessionToken, ADMIN_COOKIE_NAME } from "@/lib/auth/homepageAdminSession";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isFuturesPaperPage = pathname === "/futures-paper" || pathname.startsWith("/futures-paper/");
  const isFuturesPaperApi = pathname.startsWith("/api/futures-paper/");

  if (isFuturesPaperPage || isFuturesPaperApi) {
    const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
    const isValid = await verifyAdminSessionToken(token);

    if (!isValid) {
      if (isFuturesPaperApi) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized: Valid signed admin session required." },
          { status: 401 }
        );
      }

      // Page requests redirect to login
      const loginUrl = new URL("/admin-login", request.url);
      loginUrl.searchParams.set("returnTo", pathname + search);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/futures-paper",
    "/futures-paper/:path*",
    "/api/futures-paper/:path*"
  ]
};
