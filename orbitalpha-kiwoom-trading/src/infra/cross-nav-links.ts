/**
 * Live monitor ↔ Paper dashboard 상단 링크만 생성 (엔진·데이터와 무관).
 * 운영(Nginx 하위 경로)은 경로 링크, 로컬 직접 포트 접속은 127.0.0.1:포트.
 */
import type { IncomingMessage } from "node:http";

function normalizePublicBase(raw: string | undefined): string {
  if (!raw) return "";
  let p = raw.trim();
  if (p === "") return "";
  if (!p.startsWith("/")) p = `/${p}`;
  return p.replace(/\/+$/, "");
}

function usePathLinksForProxy(req: IncomingMessage): boolean {
  return (
    Boolean(req.headers["x-forwarded-host"]) || Boolean(req.headers["x-forwarded-proto"])
  );
}

/** Live monitor HTML에서 PAPER 화면으로 가는 href */
export function hrefToPaperDashboard(req: IncomingMessage): string {
  const base = normalizePublicBase(process.env.KIWOOM_PUBLIC_BASE_PATH);
  if (base) return `${base}/paper/`;
  if (usePathLinksForProxy(req)) return "/kiwoom/paper/";
  const port = process.env.PAPER_DASHBOARD_PORT ?? "3002";
  return `http://127.0.0.1:${port}/`;
}

/** Paper dashboard HTML에서 LIVE 모니터로 가는 href */
export function hrefToLiveMonitor(req: IncomingMessage): string {
  const base = normalizePublicBase(process.env.KIWOOM_PUBLIC_BASE_PATH);
  if (base) return `${base}/live/`;
  if (usePathLinksForProxy(req)) return "/kiwoom/live/";
  const port = process.env.MONITOR_PORT ?? "3001";
  return `http://127.0.0.1:${port}/`;
}
