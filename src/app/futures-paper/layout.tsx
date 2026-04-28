import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "선물 페이퍼 모니터 · orbitalpha.kr",
  description: "Bybit USDT 모의투자 운영 모니터"
};

const COOKIE_NAME = "homepage_admin_auth";

/** Homepage admin session only (same cookie as /admin-login, Blog Automation). */
export default async function FuturesPaperLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  if (cookieStore.get(COOKIE_NAME)?.value !== "authenticated") {
    redirect(`/admin-login?returnTo=${encodeURIComponent("/futures-paper")}`);
  }
  return <>{children}</>;
}
