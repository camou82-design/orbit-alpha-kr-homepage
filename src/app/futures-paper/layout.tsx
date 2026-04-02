import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Futures Paper · orbitalpha.kr",
  description: "Read-only Bybit USDT paper simulation reports (orbitalpha-futures-paper)."
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
