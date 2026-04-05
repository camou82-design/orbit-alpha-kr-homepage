import "dotenv/config";
/**
 * Local read-only monitor: serves JSON + HTML from monitor-status file only.
 * No trading, no broker, no control plane — browse-only on 127.0.0.1.
 */
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import type {
  MonitorAccountSummary,
  MonitorHoldingRow,
} from "../infra/monitor-snapshot.js";
import { getMonitorStatusPathForServer } from "../infra/monitor-snapshot.js";
import { hrefToPaperDashboard } from "../infra/cross-nav-links.js";
import { buildLiveOpsControlRows } from "../infra/live-ops-banner.js";
import { loadConfig, type AppConfig } from "../infra/config.js";
import {
  dashboardDefaultReturnPathLive,
  dashboardHttpAuthEnabled,
  dashboardSessionSecretOk,
  dashboardSessionUsername,
  requireDashboardSession,
  sendNoStoreHeaders,
  tryDashboardAuthRoutes,
} from "../infra/dashboard-http-auth.js";
import type { LiveOpsStateFile } from "../live/live-ops-state.js";
import {
  getLiveOpsStatePath,
  readLiveOpsState,
  setKillSwitchActive,
} from "../live/live-ops-state.js";

const HOST = process.env.MONITOR_HOST?.trim() || "127.0.0.1";
const PORT = Number(process.env.MONITOR_PORT ?? 3001);
const REFRESH_SEC = 5;
const APP_TITLE = "orbitalpha-kiwoom-trading";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escPre(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function fmtKrw(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

/** KRX-style: profit red, loss blue */
function krPnlClass(n: number): string {
  if (n > 0) return "kr-up";
  if (n < 0) return "kr-down";
  return "kr-zero";
}

function renderHoldingsRows(
  rows: MonitorHoldingRow[],
  accountRealFetchOk: boolean | undefined
): string {
  if (rows.length === 0) {
    const hint =
      accountRealFetchOk === true
        ? "보유 종목 없음 · 실계좌 조회 성공"
        : accountRealFetchOk === false
          ? "보유 없음 또는 조회 실패 — 로그 확인"
          : "보유 종목 없음";
    return `<tr><td colspan="10" class="empty-row">${esc(hint)}</td></tr>`;
  }
  return rows
    .map(
      (h) => `<tr>
  <td class="t-left">${esc(h.name)}</td>
  <td>${esc(h.symbol)}</td>
  <td class="t-num">${fmtKrw(h.quantity)}</td>
  <td class="t-num">${fmtKrw(h.avgBuyPrice)}</td>
  <td class="t-num">${fmtKrw(h.currentPrice)}</td>
  <td class="t-num">${fmtKrw(h.evalAmountKrw)}</td>
  <td class="t-num">${fmtKrw(h.costAmountKrw)}</td>
  <td class="t-num ${krPnlClass(h.evalPnlKrw)}">${fmtKrw(h.evalPnlKrw)}</td>
  <td class="t-num ${krPnlClass(h.returnPct)}">${fmtPct(h.returnPct)}</td>
  <td class="t-num ${krPnlClass(h.netPnlKrw)}">${fmtKrw(h.netPnlKrw)}</td>
</tr>`
    )
    .join("\n");
}

function defaultAccountSummary(): MonitorAccountSummary {
  return {
    totalEvalKrw: 0,
    totalCostKrw: 0,
    totalEvalPnlKrw: 0,
    totalReturnPct: 0,
    totalNetPnlKrw: 0,
    cashKrw: 0,
    cashD1Krw: 0,
    cashD2Krw: 0,
    paymentAvailableKrw: 0,
    orderAvailableKrw: 0,
    totReBuyOrderAllowableKrw: 0,
    noMarginOrderCapKrw: 0,
    noMarginOrderCapSource: "none",
    accountCreditRisk: false,
    note: "accountSummary 없음 — `npm run live:test` 등으로 스냅샷을 갱신하세요.",
  };
}

interface MonitorRenderCtx {
  hrefPaper: string;
  config: AppConfig;
  opsState: LiveOpsStateFile;
  sessionUser: string | null;
}

function renderPage(
  rawJson: string | null,
  data: Record<string, unknown> | null,
  ctx: MonitorRenderCtx
): string {
  const now = new Date().toISOString();
  const lastLogAt = typeof data?.lastLogAt === "string" ? data.lastLogAt : "—";
  const startupError = typeof data?.startupError === "string" ? data.startupError : "";
  const livePathError = typeof data?.livePathError === "string" ? data.livePathError : "";

  const sum: MonitorAccountSummary = {
    ...defaultAccountSummary(),
    ...((data?.accountSummary as Partial<MonitorAccountSummary> | undefined) ?? {}),
  };
  const holdings = (data?.holdings as MonitorHoldingRow[] | undefined) ?? [];

  const accountQueriedAt =
    typeof data?.accountQueriedAt === "string" ? data.accountQueriedAt : "—";
  const quoteQueriedAt =
    typeof data?.quoteQueriedAt === "string" ? data.quoteQueriedAt : "—";
  const connectionStatus =
    typeof data?.connectionStatus === "string" ? data.connectionStatus : "—";

  const symFromQuote = (
    data?.kiwoomQuoteFetchAttempt as { symbol?: string } | undefined
  )?.symbol;
  const symFromIntent = (
    data?.liveDryRun as { intent?: { symbol?: string } } | undefined
  )?.intent?.symbol;
  const lastSymbol = symFromQuote ?? symFromIntent ?? "—";

  const blockReasons = (data?.dryRunBlockReasons ??
    (data?.liveDryRunDecision as { reasons?: string[] } | undefined)?.reasons) as
    | string[]
    | undefined;

  const allowed = (data?.liveDryRunDecision as { allowed?: boolean } | undefined)?.allowed;

  const accountRealFetchOk = data?.accountRealFetchOk as boolean | undefined;
  const quoteRealFetchOk = data?.quoteRealFetchOk as boolean | undefined;
  const liveTestOrderEligible = data?.liveTestOrderEligible as boolean | undefined;
  const liveTestOrdersToday = data?.liveTestOrdersToday as number | undefined;
  const lastLiveTestOrderResult = data?.lastLiveTestOrderResult as Record<string, unknown> | undefined;

  const jsonBlock =
    rawJson === null
      ? esc("스냅샷 없음 — CLI를 한 번 실행하세요 (예: npm run live:test).")
      : escPre(rawJson);

  const configLoaded = data?.configLoaded as Record<string, unknown> | undefined;
  const kiwoomConfigured = configLoaded?.kiwoomConnectionConfigured === true;
  const liveTestFlag = configLoaded?.liveTestOrderEnabled;
  const liveTestOrderEnvKnown = typeof liveTestFlag === "boolean";
  const liveTestOrderEnabled = liveTestFlag === true;

  const entryMode =
    typeof data?.entryMode === "string" ? data.entryMode : "—";
  const snapshotStale =
    !configLoaded ||
    typeof (configLoaded as Record<string, unknown>).liveTestOrderEnabled === "undefined";

  const warnStrip =
    liveTestOrderEligible === true
      ? `<strong>경고</strong>: 테스트 주문 가드 통과 — 이 실행에서 <strong>지정가 신규매수 1주</strong>가 전송될 수 있습니다. 전략 루프·자동 실주문은 비활성입니다. UI 주문 버튼 없음.`
      : "";

  const { model: ops, ext: ox, envWarnings } = buildLiveOpsControlRows(
    data,
    ctx.opsState,
    ctx.config
  );
  const isAdmin =
    Boolean(ctx.sessionUser?.trim()) &&
    ctx.sessionUser!.trim() === ctx.config.adminUsername.trim();

  const envWarnHtml =
    envWarnings.length > 0
      ? `<div class="env-warn">${envWarnings.map((w) => `<div>${esc(w)}</div>`).join("")}</div>`
      : "";

  const killBanner = ctx.opsState.killSwitchActive
    ? `<div class="kill-active-banner">긴급 중단 활성화 — 신규 실주문(매수)이 즉시 차단된 상태입니다. 해제는 관리자만 가능합니다.</div>`
    : "";

  const staleNote = snapshotStale
    ? `<span class="muted" style="display:block;margin-top:0.25rem;color:#856404"><strong>스냅샷 주의:</strong> 이 JSON이 구버전이거나 엔진이 이 경로에서 쓰지 않은 파일일 수 있습니다. 엔진을 <strong>orbitalpha-kiwoom-trading</strong> 루트에서 다시 실행하거나 <code>/api/status</code>의 <code>configLoaded.monitorStatusFilePath</code>를 확인하세요.</span>`
    : "";

  const stCls = (s: string): string =>
    s === "주문 가능" || s === "가능" || s === "YES"
      ? "state-ok"
      : s === "제한됨" || s === "제한"
        ? "state-warn"
        : "state-bad";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="${REFRESH_SEC}" />
  <title>${esc(APP_TITLE)} — 계좌 현황</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Malgun Gothic", "맑은 고딕", Dotum, sans-serif;
      font-size: 13px;
      color: #222;
      background: #e9ecef;
    }
    .topbar {
      background: linear-gradient(180deg, #2f4f6f 0%, #1e3a52 100%);
      color: #fff;
      padding: 0.45rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .topbar strong { font-size: 14px; }
    .topbar .sub { font-size: 11px; opacity: 0.9; }
    .topbar-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.45rem;
      width: 100%;
    }
    a.toplink {
      display: inline-block;
      padding: 0.28rem 0.6rem;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.38);
      border-radius: 3px;
      text-decoration: none;
      white-space: nowrap;
    }
    a.toplink:hover { background: rgba(255, 255, 255, 0.22); }
    .btn-row { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; justify-content: flex-end; }
    button.topbtn {
      display: inline-block;
      padding: 0.28rem 0.6rem;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.38);
      border-radius: 3px;
      cursor: pointer;
      font-family: inherit;
    }
    button.topbtn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.22); }
    button.topbtn.kill-soon { opacity: 0.55; cursor: not-allowed; }
    .ops-banner {
      background: #fff;
      border-bottom: 2px solid #2f4f6f;
      padding: 0.65rem 1rem 0.55rem;
    }
    .ops-banner h2 { margin: 0 0 0.45rem 0; font-size: 13px; color: #1e3a52; }
    .ops-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
      gap: 0.35rem 0.75rem;
      font-size: 12px;
    }
    .ops-line .k { color: #555; }
    .ops-line .v { font-weight: 700; margin-left: 0.2rem; }
    .state-ok { color: #1b5e20; }
    .state-warn { color: #e65100; }
    .state-bad { color: #b00020; }
    .warn-strip {
      background: #fff3cd;
      border-bottom: 1px solid #e0c766;
      padding: 0.35rem 1rem;
      font-size: 12px;
    }
    details.dev-details { margin-top: 0.65rem; border: 1px solid #c5cbd3; background: #fafbfc; padding: 0 0.5rem 0.5rem; }
    details.dev-details > summary {
      cursor: pointer;
      font-weight: 700;
      font-size: 12px;
      padding: 0.45rem 0.15rem;
      color: #333;
    }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 0.6rem 1rem 1.5rem; }
    .sum-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
      gap: 0.4rem;
      margin-bottom: 0.65rem;
    }
    .sum-cell {
      background: #fff;
      border: 1px solid #c5cbd3;
      padding: 0.45rem 0.55rem;
      box-shadow: inset 0 1px 0 #fff;
    }
    .sum-cell .label { font-size: 11px; color: #555; margin-bottom: 0.2rem; }
    .sum-cell .muted { font-size: 10px; color: #666; font-weight: 400; }
    .sum-cell .val { font-size: 15px; font-weight: 700; font-family: Consolas, monospace; }
    .sum-cell .val.small { font-size: 12px; font-weight: 600; }
    .panel-title {
      background: #dfe4ea;
      border: 1px solid #b8c0cc;
      border-bottom: none;
      padding: 0.35rem 0.5rem;
      font-weight: 700;
      font-size: 12px;
    }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid #b8c0cc;
      background: #fff;
    }
    table.holdings {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    table.holdings th {
      background: #f0f2f5;
      border: 1px solid #d0d6de;
      padding: 0.35rem 0.3rem;
      font-weight: 600;
      white-space: nowrap;
    }
    table.holdings td {
      border: 1px solid #e2e6ec;
      padding: 0.35rem 0.3rem;
      text-align: right;
    }
    table.holdings td.t-left { text-align: left; }
    table.holdings td.t-num { font-family: Consolas, monospace; }
    .empty-row { text-align: center !important; color: #666; padding: 0.75rem !important; }
    .kr-up { color: #d32f2f; font-weight: 600; }
    .kr-down { color: #1565c0; font-weight: 600; }
    .kr-zero { color: #333; }
    .foot {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      margin-top: 0.65rem;
    }
    @media (max-width: 720px) { .foot { grid-template-columns: 1fr; } }
    .foot-box {
      background: #fff;
      border: 1px solid #c5cbd3;
      padding: 0.5rem 0.6rem;
      font-size: 12px;
    }
    .foot-box h3 { margin: 0 0 0.35rem 0; font-size: 12px; color: #333; }
    .foot-box .line { margin: 0.15rem 0; color: #444; }
    .foot-box .muted { color: #666; font-size: 11px; }
    details.raw { margin-top: 0.5rem; }
    details.raw summary { cursor: pointer; color: #555; font-size: 12px; padding: 0.25rem 0; }
    pre.raw {
      margin: 0.35rem 0 0;
      padding: 0.5rem;
      background: #1e1e1e;
      color: #d4d4d4;
      border-radius: 4px;
      overflow: auto;
      font-size: 11px;
      max-height: 18rem;
    }
    .err { color: #b00020; font-size: 12px; margin: 0.25rem 0; }
    .note { font-size: 11px; color: #555; margin-top: 0.35rem; line-height: 1.4; }
    .env-warn {
      background: #fff8e6;
      border-bottom: 2px solid #f9a825;
      padding: 0.45rem 1rem;
      font-size: 12px;
      color: #6d4c00;
    }
    .kill-active-banner {
      background: #8b0000;
      color: #fff;
      padding: 0.45rem 1rem;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-row">
      <div><strong>${esc(APP_TITLE)}</strong> · <span class="sub">실주문 계열 운영 모니터 (read-only)</span></div>
      <div class="btn-row">
        <button type="button" class="topbtn" id="btnKillOn" ${ctx.opsState.killSwitchActive ? "disabled" : ""}>긴급 중단</button>
        ${isAdmin ? `<button type="button" class="topbtn" id="btnKillOff" ${!ctx.opsState.killSwitchActive ? "disabled" : ""}>긴급 중단 해제</button>` : ""}
        <a class="toplink" href="${esc(ctx.hrefPaper)}">PAPER 급등주 모의매매 열기</a>
        <button type="button" class="topbtn" id="btnLogout">로그아웃</button>
      </div>
    </div>
    <div class="sub">자동 갱신 약 ${String(REFRESH_SEC)}초 · 스냅샷: ${esc(lastLogAt)} · 운영상태 파일: <code>${esc(getLiveOpsStatePath())}</code></div>
  </div>
  ${envWarnHtml}
  ${killBanner}
  <div class="ops-banner">
    <h2>운영 상태 요약</h2>
    <div class="ops-grid">
      <div class="ops-line"><span class="k">운영 상태:</span> <span class="v ${stCls(ops.overallState)}">${esc(ops.overallState)}</span></div>
      <div class="ops-line"><span class="k">실주문 가능:</span> <span class="v ${stCls(ops.realOrderYesNo)}">${esc(ops.realOrderYesNo)}</span></div>
      <div class="ops-line" style="grid-column: 1 / -1"><span class="k">차단 사유:</span> <span class="v">${esc(ops.blockReasonLine)}</span></div>
      <div class="ops-line"><span class="k">장 상태:</span> <span class="v">${esc(ops.sessionMarket)}</span></div>
      <div class="ops-line"><span class="k">계좌 조회:</span> <span class="v">${esc(ops.accountLookup)}</span></div>
      <div class="ops-line"><span class="k">시세 수신:</span> <span class="v">${esc(ops.quoteReceive)}</span></div>
      <div class="ops-line"><span class="k">LIVE 설정:</span> <span class="v">${esc(ops.liveConfigOnOff)}</span> <span class="k" style="margin-left:0.5rem">(환경 LIVE_TRADING 게이트)</span></div>
      <div class="ops-line"><span class="k">실제 주문 상태:</span> <span class="v ${stCls(ops.actualOrderState)}">${esc(ops.actualOrderState)}</span> <span class="k" style="margin-left:0.5rem">(가드·장·연동·운영)</span></div>
      <div class="ops-line"><span class="k">긴급 중단:</span> <span class="v ${ctx.opsState.killSwitchActive ? "state-bad" : "state-ok"}">${esc(ox.killSwitchLine)}</span></div>
      <div class="ops-line"><span class="k">오늘 주문 수 / 상한:</span> <span class="v">${esc(ox.ordersToday)} / ${esc(ox.ordersMax)}</span></div>
      <div class="ops-line"><span class="k">남은 허용 주문:</span> <span class="v">${esc(ox.ordersRemaining)}</span></div>
      <div class="ops-line"><span class="k">오늘 누적 실현손익:</span> <span class="v">${esc(ox.dailyPnlLine)}</span></div>
      <div class="ops-line"><span class="k">손실 제한 기준:</span> <span class="v">${esc(ox.lossLimitLine)}</span></div>
      <div class="ops-line"><span class="k">운영 차단(통제):</span> <span class="v">${esc(ox.opsBlockedLine)}</span></div>
      <div class="ops-line" style="grid-column: 1 / -1"><span class="k">재진입 제한:</span> <span class="v">${esc(ox.reentryLine)}</span></div>
      <div class="ops-line"><span class="k">마지막 주문 시도:</span> <span class="v">${esc(ox.lastAttempt)}</span></div>
      <div class="ops-line"><span class="k">마지막 주문 성공:</span> <span class="v">${esc(ox.lastSuccess)}</span></div>
      <div class="ops-line"><span class="k">마지막 주문 실패:</span> <span class="v">${esc(ox.lastFailure)}</span></div>
      <div class="ops-line" style="grid-column: 1 / -1; margin-top:0.35rem; padding-top:0.35rem; border-top:1px solid #dee2e6"><span class="k" style="font-weight:700">주문 자금 가드</span> <span class="k">(미수불가·현금)</span></div>
      <div class="ops-line"><span class="k">현금 예수금:</span> <span class="v">${esc(ox.fundingCashLine)}</span></div>
      <div class="ops-line"><span class="k">D+2 추정예수금:</span> <span class="v">${esc(ox.fundingD2Line)}</span></div>
      <div class="ops-line"><span class="k">미수불가 100% 주문가능:</span> <span class="v">${esc(ox.fundingNoMarginCapLine)}</span></div>
      <div class="ops-line"><span class="k">상한 출처 키:</span> <span class="v" style="font-weight:600;font-family:Consolas,monospace">${esc(ox.fundingCapSourceLine)}</span></div>
      <div class="ops-line"><span class="k">기준 주문 필요 금액:</span> <span class="v">${esc(ox.fundingRequiredLine)}</span></div>
      <div class="ops-line"><span class="k">미수불가 가드 통과:</span> <span class="v ${stCls(ox.fundingGateYesNo)}">${esc(ox.fundingGateYesNo)}</span></div>
      <div class="ops-line" style="grid-column: 1 / -1"><span class="k">가드 사유:</span> <span class="v">${esc(ox.fundingReasonLine)}</span></div>
    </div>
  </div>
  ${warnStrip ? `<div class="warn-strip">${warnStrip}</div>` : ""}
  <div class="wrap">
    <div class="sum-grid">
      <div class="sum-cell">
        <div class="label">총 평가금액</div>
        <div class="val">${fmtKrw(sum.totalEvalKrw)}</div>
      </div>
      <div class="sum-cell">
        <div class="label">총 매입금액</div>
        <div class="val">${fmtKrw(sum.totalCostKrw)}</div>
      </div>
      <div class="sum-cell">
        <div class="label">총 평가손익</div>
        <div class="val ${krPnlClass(sum.totalEvalPnlKrw)}">${fmtKrw(sum.totalEvalPnlKrw)}</div>
      </div>
      <div class="sum-cell">
        <div class="label">총 수익률</div>
        <div class="val ${krPnlClass(sum.totalReturnPct)}">${fmtPct(sum.totalReturnPct)}</div>
      </div>
      <div class="sum-cell">
        <div class="label">총 순손익 <span class="muted">(세금·수수료 포함)</span></div>
        <div class="val ${krPnlClass(sum.totalNetPnlKrw)}">${fmtKrw(sum.totalNetPnlKrw)}</div>
      </div>
      <div class="sum-cell">
        <div class="label">실잔고 조회</div>
        <div class="val small">${accountRealFetchOk === undefined ? "—" : accountRealFetchOk ? "성공" : "실패"}</div>
      </div>
      <div class="sum-cell">
        <div class="label">실시세 조회</div>
        <div class="val small">${quoteRealFetchOk === undefined ? "—" : quoteRealFetchOk ? "성공" : "실패"}</div>
      </div>
      <div class="sum-cell">
        <div class="label">테스트 주문 가능</div>
        <div class="val small">${liveTestOrderEligible === undefined ? "—" : liveTestOrderEligible ? "예" : "아니오"}</div>
      </div>
      <div class="sum-cell">
        <div class="label">오늘 테스트 주문 횟수</div>
        <div class="val small">${liveTestOrdersToday === undefined ? "—" : esc(String(liveTestOrdersToday))}</div>
      </div>
      <div class="sum-cell">
        <div class="label">LIVE_TEST 환경</div>
        <div class="val small">${!liveTestOrderEnvKnown ? "—" : liveTestOrderEnabled ? "on" : "off"}</div>
      </div>
    </div>

    <div class="panel-title">예수금 · 가용금 <span style="font-weight:400;color:#555">(kt00005 상단 필드)</span></div>
    <div class="sum-grid">
      <div class="sum-cell">
        <div class="label">예수금</div>
        <div class="val">${fmtKrw(sum.cashKrw)}</div>
      </div>
      <div class="sum-cell">
        <div class="label">D+1 예수금</div>
        <div class="val">${fmtKrw(sum.cashD1Krw)}</div>
      </div>
      <div class="sum-cell">
        <div class="label">D+2 예수금</div>
        <div class="val">${fmtKrw(sum.cashD2Krw)}</div>
      </div>
      <div class="sum-cell">
        <div class="label">미수불가 100% 주문가능 <span class="muted" style="font-size:10px">(실주문 한도)</span></div>
        <div class="val">${fmtKrw(sum.noMarginOrderCapKrw)}</div>
      </div>
      <div class="sum-cell">
        <div class="label">주문가능금 <span class="muted" style="font-size:10px">(ord_alowa)</span></div>
        <div class="val">${fmtKrw(sum.orderAvailableKrw)}</div>
      </div>
      <div class="sum-cell">
        <div class="label">결제·이체 가능액 <span class="muted" style="font-size:10px">(pymn_alow_amt)</span></div>
        <div class="val">${fmtKrw(sum.paymentAvailableKrw)}</div>
      </div>
      <div class="sum-cell">
        <div class="label">재매수 주문가용 합계 <span class="muted" style="font-size:10px">(tot_re_buy_alowa)</span></div>
        <div class="val">${fmtKrw(sum.totReBuyOrderAllowableKrw)}</div>
      </div>
    </div>

    <p class="note">${esc(sum.note ?? "")}</p>

    <div class="panel-title">보유 종목</div>
    <div class="table-wrap">
      <table class="holdings">
        <thead>
          <tr>
            <th>종목명</th>
            <th>종목코드</th>
            <th>보유수량</th>
            <th>평균매입가</th>
            <th>현재가</th>
            <th>평가금액</th>
            <th>매입금액</th>
            <th>평가손익</th>
            <th>수익률</th>
            <th>순손익<br/><span style="font-weight:400;font-size:10px">(세금·수수료)</span></th>
          </tr>
        </thead>
        <tbody>
          ${renderHoldingsRows(holdings, accountRealFetchOk)}
        </tbody>
      </table>
    </div>

    <details class="dev-details">
      <summary>개발자·내부 판정 정보 (기본 접힘)</summary>
      ${staleNote}
      ${startupError ? `<p class="err">시작 오류(원문): ${esc(startupError)}</p>` : ""}
      ${livePathError ? `<p class="err">Live 경로(원문): ${esc(livePathError)}</p>` : ""}
      <div class="foot">
        <div class="foot-box">
          <h3>연결·조회</h3>
          <div class="line"><span class="muted">연결 상태:</span> ${esc(connectionStatus)}</div>
          <div class="line"><span class="muted">키움 env:</span> ${kiwoomConfigured ? "configured" : "not configured"}</div>
          <div class="line"><span class="muted">엔진 entryMode:</span> ${esc(entryMode)}</div>
          <div class="line"><span class="muted">스냅샷 파일 (엔진 cwd):</span> ${esc(
            typeof configLoaded?.monitorStatusFilePath === "string"
              ? (configLoaded.monitorStatusFilePath as string)
              : "— (구 스냅샷)"
          )}</div>
          <div class="line"><span class="muted">계좌 조회 시각:</span> ${esc(accountQueriedAt)}</div>
          <div class="line"><span class="muted">시세 조회 시각:</span> ${esc(quoteQueriedAt)}</div>
          <div class="line"><span class="muted">마지막 심볼:</span> ${esc(String(lastSymbol))}</div>
        </div>
        <div class="foot-box">
          <h3>dry-run 판정 (내부)</h3>
          <div class="line"><span class="muted">allowed:</span> ${allowed === undefined ? "—" : esc(String(allowed))}</div>
          <div class="line"><span class="muted">reasons (내부 코드):</span> ${blockReasons?.length ? esc(blockReasons.join(", ")) : "—"}</div>
          <div class="line muted" style="margin-top:0.4rem">서버 렌더: ${esc(now)}</div>
        </div>
        <div class="foot-box">
          <h3>테스트 실주문 (가드·원시)</h3>
          <div class="line"><span class="muted">마지막 결과:</span> ${lastLiveTestOrderResult ? esc(JSON.stringify(lastLiveTestOrderResult)) : "—"}</div>
          <div class="line muted" style="margin-top:0.35rem">가드 미통과 시 broker 호출 없음 · 매도·시장가·복수종목 없음</div>
        </div>
      </div>
      <details class="raw">
        <summary>원문 JSON 보기</summary>
        <pre class="raw">${jsonBlock}</pre>
      </details>
    </details>
  </div>
  <script>
(function(){
  var dashAuth = ${dashboardHttpAuthEnabled() ? "true" : "false"};
  function postOps(act) {
    if (!dashAuth) {
      alert("긴급 중단을 쓰려면 KIWOOM_DASHBOARD_HTTP_AUTH=true 와 로그인이 필요합니다.");
      return;
    }
    if (act === "kill_on" && !confirm("긴급 중단을 활성화하면 신규 매수 실주문이 즉시 차단됩니다. 진행할까요?")) return;
    if (act === "kill_off" && !confirm("긴급 중단을 해제합니다. (관리자만 가능) 진행할까요?")) return;
    fetch("ops/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: act === "kill_on" ? "kill_on" : "kill_off" })
    })
      .then(function(r) { return r.json().then(function(j) { return { r: r, j: j }; }); })
      .then(function(x) {
        if (!x.j || !x.j.ok) {
          alert(x.j && x.j.error === "admin_only" ? "관리자만 해제할 수 있습니다." : "요청이 거절되었습니다.");
          return;
        }
        location.reload();
      })
      .catch(function() { alert("네트워크 오류"); });
  }
  var kOn = document.getElementById("btnKillOn");
  if (kOn) kOn.addEventListener("click", function() { postOps("kill_on"); });
  var kOff = document.getElementById("btnKillOff");
  if (kOff) kOff.addEventListener("click", function() { postOps("kill_off"); });
  var el = document.getElementById("btnLogout");
  if (!el) return;
  el.addEventListener("click", function(){
    if (!confirm("로그아웃 하시겠습니까?")) return;
    fetch("auth/logout", { method: "POST", credentials: "include", redirect: "follow" })
      .then(function(r){ location.replace(r.url || "auth/login"); })
      .catch(function(){ location.replace("auth/login"); });
  });
  if (window.history && window.history.replaceState) {
    history.replaceState(null, "", location.href);
  }
})();
  </script>
</body>
</html>`;
}

function pathOnly(url: string): string {
  const noHash = url.split("#")[0] ?? "/";
  const q = noHash.indexOf("?");
  return q < 0 ? noHash : noHash.slice(0, q);
}

function queryString(url: string): string {
  const noHash = url.split("#")[0] ?? "";
  const q = noHash.indexOf("?");
  return q < 0 ? "" : noHash.slice(q + 1);
}

async function readJsonBody(
  req: import("node:http").IncomingMessage
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function handleMonitorRequest(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse
): Promise<void> {
  const rawUrl = req.url ?? "/";
  const p = pathOnly(rawUrl);
  const qs = queryString(rawUrl);

  if (await tryDashboardAuthRoutes(req, res, p, qs, dashboardDefaultReturnPathLive()))
    return;

  if (p === "/ops/control" && req.method === "POST") {
    if (!dashboardHttpAuthEnabled()) {
      sendNoStoreHeaders(res);
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "dashboard_auth_required" }));
      return;
    }
    if (!requireDashboardSession(req, res, dashboardDefaultReturnPathLive())) return;
    const user = dashboardSessionUsername(req);
    if (!user) {
      sendNoStoreHeaders(res);
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "no_session" }));
      return;
    }
    const body = await readJsonBody(req);
    const action = String(body.action ?? "");
    const cfg = loadConfig();
    sendNoStoreHeaders(res);
    if (action === "kill_on") {
      setKillSwitchActive(true, user);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (action === "kill_off") {
      if (user.trim() !== cfg.adminUsername.trim()) {
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "admin_only" }));
        return;
      }
      setKillSwitchActive(false, user);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "bad_action" }));
    return;
  }

  if (p === "/" || p === "") {
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("method not allowed");
      return;
    }
    if (!requireDashboardSession(req, res, dashboardDefaultReturnPathLive())) return;
    const path = getMonitorStatusPathForServer();
    let raw: string | null = null;
    let data: Record<string, unknown> | null = null;
    if (existsSync(path)) {
      try {
        raw = readFileSync(path, "utf8");
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        raw = null;
        data = null;
      }
    }
    if (dashboardHttpAuthEnabled()) sendNoStoreHeaders(res);
    const cfg = loadConfig();
    const opsSt = readLiveOpsState();
    const sessionUser = dashboardSessionUsername(req);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      renderPage(raw, data, {
        hrefPaper: hrefToPaperDashboard(req),
        config: cfg,
        opsState: opsSt,
        sessionUser,
      })
    );
    return;
  }

  if (p === "/api/status") {
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("method not allowed");
      return;
    }
    if (!requireDashboardSession(req, res, dashboardDefaultReturnPathLive())) return;
    const statusPath = getMonitorStatusPathForServer();
    if (!existsSync(statusPath)) {
      if (dashboardHttpAuthEnabled()) sendNoStoreHeaders(res);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            error: "no_snapshot_yet",
            hint: "Run npm run live:test (or npm start) once to write data/monitor-status.json",
          },
          null,
          2
        )
      );
      return;
    }
    try {
      const raw = readFileSync(statusPath, "utf8");
      if (dashboardHttpAuthEnabled()) sendNoStoreHeaders(res);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(raw);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
}

const server = createServer((req, res) => {
  void handleMonitorRequest(req, res).catch((e) => {
    console.error("[monitor] request error:", e);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("internal error");
  });
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[monitor] 포트 사용 중: ${HOST}:${PORT} — 다른 프로세스를 종료하거나 MONITOR_PORT를 바꾸세요. (${err.message})`
    );
  } else {
    console.error(`[monitor] 서버 오류:`, err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[monitor] cwd: ${process.cwd()}`);
  console.log(
    `[monitor] read-only local monitor at http://${HOST}:${PORT} (status file: ${getMonitorStatusPathForServer()})`
  );
  console.log(
    "[monitor] 엔진과 다른 cwd이면 스냅샷이 어긋날 수 있습니다. MONITOR_STATUS_FILE(절대 경로) 또는 KIWOOM_PROJECT_ROOT로 경로를 고정하세요."
  );
  if (dashboardHttpAuthEnabled() && !dashboardSessionSecretOk()) {
    console.warn(
      "[monitor] KIWOOM_DASHBOARD_HTTP_AUTH is on but KIWOOM_DASHBOARD_SESSION_SECRET is missing or too short (min 16)."
    );
  }
});
