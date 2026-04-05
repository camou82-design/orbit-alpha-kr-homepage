/**
 * Live monitor ↔ Paper dashboard 상단 링크만 생성 (엔진·데이터와 무관).
 * 운영 경로는 `KIWOOM_*_PUBLIC_MOUNT`와 동일 규칙 (`dashboard-http-auth.ts`).
 */
import type { IncomingMessage } from "node:http";
import {
  dashboardPublicMountLive,
  dashboardPublicMountPaper,
} from "./dashboard-http-auth.js";

function usePathLinksForProxy(req: IncomingMessage): boolean {
  return (
    Boolean(req.headers["x-forwarded-host"]) || Boolean(req.headers["x-forwarded-proto"])
  );
}

/** Live monitor HTML에서 PAPER 화면으로 가는 href */
export function hrefToPaperDashboard(req: IncomingMessage): string {
  const absolute = process.env.KIWOOM_PAPER_URL?.trim();
  if (absolute) return absolute;

  const m = dashboardPublicMountPaper();
  if (m) return `${m}/`;

  if (usePathLinksForProxy(req)) return "/paper/";

  const port = process.env.PAPER_DASHBOARD_PORT ?? "3002";
  return `http://127.0.0.1:${port}/`;
}

/** Paper dashboard HTML에서 LIVE 모니터로 가는 href */
export function hrefToLiveMonitor(req: IncomingMessage): string {
  const absolute = process.env.KIWOOM_LIVE_URL?.trim();
  if (absolute) return absolute;

  const m = dashboardPublicMountLive();
  if (m) return `${m}/`;

  if (usePathLinksForProxy(req)) return "/live/";

  const port = process.env.MONITOR_PORT ?? "3001";
  return `http://127.0.0.1:${port}/`;
}
