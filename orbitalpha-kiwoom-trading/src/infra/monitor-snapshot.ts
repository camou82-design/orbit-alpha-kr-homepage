import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

/** Account strip totals — real HTS feed can replace stub zeros later. */
export interface MonitorAccountSummary {
  totalEvalKrw: number;
  totalCostKrw: number;
  totalEvalPnlKrw: number;
  totalReturnPct: number;
  /** 세금·수수료 반영 합계 순손익 (실제 연동 시 유효; dry-run 스텁은 0). */
  totalNetPnlKrw: number;
  /** kt00005 상단 `entr` (예수금으로 통상 표기; HTS와 대조 권장). */
  cashKrw: number;
  /** kt00005 `entr_d1` (D+1 예수금). */
  cashD1Krw: number;
  /** kt00005 `entr_d2` (D+2 예수금). */
  cashD2Krw: number;
  /** kt00005 `pymn_alow_amt` — 키움 약어; 이체·출금 등 가능액으로 해석되는 경우가 많으나 명세 대조 권장. */
  paymentAvailableKrw: number;
  /** kt00005 `ord_alowa` — 주문가능금(키명 기준). */
  orderAvailableKrw: number;
  /** kt00005 `tot_re_buy_alowa` — 재매수 관련 주문가용 합계 등으로 추정 가능; 의미는 문서·HTS 대조 권장. */
  totReBuyOrderAllowableKrw: number;
  note?: string;
}

/** One row in the holdings grid (local monitor). */
export interface MonitorHoldingRow {
  name: string;
  symbol: string;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  evalAmountKrw: number;
  costAmountKrw: number;
  evalPnlKrw: number;
  returnPct: number;
  /** 세금·수수료 포함 순손익 (실제 연동 시 유효; 스텁은 0). */
  netPnlKrw: number;
}

/** Written by CLI only; read by local monitor HTTP server (read-only). */
export interface LocalMonitorSnapshot {
  schemaVersion: 1;
  lastLogAt: string;
  /** True while the CLI process has not finished its run (paper loop = long-running). */
  appRunning: boolean;
  pid: number;
  startupError?: string;
  /** Live path early exit (e.g. session missing, confirmation cancelled). */
  livePathError?: string;
  entryMode?: string | null;
  configLoaded?: Record<string, unknown>;
  authMode?: { authEnabled: boolean };
  sessionCurrent?: { username: string; role: string };
  dashboardReady?: boolean;
  liveEngine?: Record<string, unknown>;
  marketSessionDetected?: Record<string, unknown>;
  kiwoomConnectAttempt?: boolean;
  kiwoomConnectSummary?: string;
  kiwoomAccountFetchAttempt?: boolean;
  kiwoomQuoteFetchAttempt?: { symbol: string };
  liveDryRun?: Record<string, unknown>;
  liveDryRunDecision?: Record<string, unknown>;
  dryRunBlockReasons?: string[];
  /** HTS-style account strip (dry-run: zeros until real balance API exists). */
  accountSummary?: MonitorAccountSummary;
  holdings?: MonitorHoldingRow[];
  accountQueriedAt?: string;
  quoteQueriedAt?: string;
  connectionStatus?: string;
  /** Live REST: last fetchAccountInfo TR outcome. */
  accountRealFetchOk?: boolean;
  /** Live REST: last fetchQuote TR outcome. */
  quoteRealFetchOk?: boolean;
  /** All guards passed for the one-shot live test buy (no guarantee order ran yet). */
  liveTestOrderEligible?: boolean;
  liveTestOrderBlockReasons?: string[];
  /** Count of accepted live test orders today (persisted under data/). */
  liveTestOrdersToday?: number;
  lastLiveTestOrderResult?: Record<string, unknown>;
}

/**
 * 엔진·`npm run monitor`가 **동일 파일**을 쓰려면 cwd가 같거나 아래 env로 경로를 고정하세요.
 * - `MONITOR_STATUS_FILE`이 절대 경로면 그대로 사용 (PM2/쉘 cwd 불일치 시 권장).
 * - 상대 경로면 `process.cwd()`에 붙임 (기존 동작).
 * - 미설정 시 `KIWOOM_PROJECT_ROOT/data/monitor-status.json` (루트는 절대 또는 cwd 기준 상대).
 */
function defaultPath(): string {
  const fileOverride = process.env.MONITOR_STATUS_FILE?.trim();
  if (fileOverride && fileOverride.length > 0) {
    return isAbsolute(fileOverride) ? fileOverride : join(process.cwd(), fileOverride);
  }
  const projectRoot = process.env.KIWOOM_PROJECT_ROOT?.trim();
  if (projectRoot && projectRoot.length > 0) {
    const root = isAbsolute(projectRoot) ? projectRoot : join(process.cwd(), projectRoot);
    return join(root, "data", "monitor-status.json");
  }
  return join(process.cwd(), "data", "monitor-status.json");
}

function readExisting(path: string): Partial<LocalMonitorSnapshot> {
  try {
    const t = readFileSync(path, "utf8");
    return JSON.parse(t) as Partial<LocalMonitorSnapshot>;
  } catch {
    return {};
  }
}

/**
 * Merge fields into `data/monitor-status.json` (sync, CLI-side only).
 * Does not call brokers or change trading logic.
 */
export function mergeMonitorSnapshot(
  partial: Partial<LocalMonitorSnapshot>
): void {
  const path = defaultPath();
  mkdirSync(dirname(path), { recursive: true });
  const prev = readExisting(path);
  const base: LocalMonitorSnapshot = {
    schemaVersion: 1,
    lastLogAt: new Date().toISOString(),
    appRunning: false,
    pid: process.pid,
  };
  const merged = { ...base, ...prev, ...partial };
  const next: LocalMonitorSnapshot = {
    ...merged,
    schemaVersion: 1,
    lastLogAt: new Date().toISOString(),
    pid: partial.pid ?? merged.pid ?? process.pid,
  };
  writeFileSync(path, JSON.stringify(next, null, 2), "utf8");
}

export function getMonitorStatusPathForServer(): string {
  return defaultPath();
}
