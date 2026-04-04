/**
 * Local read-only monitor: serves JSON + HTML from monitor-status file only.
 * No trading, no broker, no control plane — browse-only on 127.0.0.1.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import type {
  MonitorAccountSummary,
  MonitorHoldingRow,
} from "../infra/monitor-snapshot.js";
import { getMonitorStatusPathForServer } from "../infra/monitor-snapshot.js";
import { hrefToPaperDashboard } from "../infra/cross-nav-links.js";

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
    note: "accountSummary 없음 — `npm run live:test` 등으로 스냅샷을 갱신하세요.",
  };
}

function renderPage(
  rawJson: string | null,
  data: Record<string, unknown> | null,
  hrefPaper: string
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
  const liveTradingFlag = configLoaded?.liveTradingEnabled;
  const liveTradingKnown = typeof liveTradingFlag === "boolean";
  const liveTradingEnabled = liveTradingFlag === true;
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
      : `전략 자동 실주문 <strong>비활성</strong>(기본) · 제한 테스트 주문은 <code>LIVE_TEST_*</code> 가드 충족 시에만 · 주문 UI 없음`;

  const staleNote = snapshotStale
    ? `<span class="muted" style="display:block;margin-top:0.25rem;color:#856404"><strong>스냅샷 주의:</strong> 이 JSON이 구버전이거나 엔진이 이 경로에서 쓰지 않은 파일일 수 있습니다. 엔진을 <strong>orbitalpha-kiwoom-trading</strong> 루트에서 다시 실행하거나 <code>/api/status</code>의 <code>configLoaded.monitorStatusFilePath</code>를 확인하세요.</span>`
    : "";

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
    .warn-strip {
      background: #fff3cd;
      border-bottom: 1px solid #e0c766;
      padding: 0.35rem 1rem;
      font-size: 12px;
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
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-row">
      <div><strong>${esc(APP_TITLE)}</strong> · <span class="sub">로컬 계좌형 모니터 (read-only)</span></div>
      <a class="toplink" href="${esc(hrefPaper)}">PAPER 급등주 모의매매 열기</a>
    </div>
    <div class="sub">127.0.0.1 only · 자동 갱신 약 ${String(REFRESH_SEC)}초 · 스냅샷: ${esc(lastLogAt)}</div>
  </div>
  <div class="warn-strip">
    ${warnStrip}
    <span class="muted" style="display:block;margin-top:0.25rem">LIVE_TRADING_ENABLED=${esc(
      String(liveTradingEnabled)
    )} · LIVE_TEST_ORDER_ENABLED=${esc(String(liveTestOrderEnabled))}</span>
  </div>
  <div class="wrap">
    ${startupError ? `<p class="err">시작 오류: ${esc(startupError)}</p>` : ""}
    ${livePathError ? `<p class="err">Live 경로: ${esc(livePathError)}</p>` : ""}

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
        <div class="label">LIVE_TRADING (전략 게이트)</div>
        <div class="val small">${!liveTradingKnown ? "—" : liveTradingEnabled ? "on" : "off"}</div>
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

    <div class="foot">
      <div class="foot-box">
        <h3>연결·조회</h3>
        <div class="line"><span class="muted">연결 상태:</span> ${esc(connectionStatus)}</div>
        <div class="line"><span class="muted">키움 env:</span> ${kiwoomConfigured ? "configured" : "not configured"}</div>
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
        <h3>dry-run 판정</h3>
        <div class="line"><span class="muted">allowed:</span> ${allowed === undefined ? "—" : esc(String(allowed))}</div>
        <div class="line"><span class="muted">차단 사유:</span> ${blockReasons?.length ? esc(blockReasons.join(", ")) : "—"}</div>
        <div class="line muted" style="margin-top:0.4rem">서버 렌더: ${esc(now)}</div>
      </div>
      <div class="foot-box">
        <h3>테스트 실주문 (가드)</h3>
        <div class="line"><span class="muted">마지막 결과:</span> ${lastLiveTestOrderResult ? esc(JSON.stringify(lastLiveTestOrderResult)) : "—"}</div>
        <div class="line muted" style="margin-top:0.35rem">가드 미통과 시 broker 호출 없음 · 매도·시장가·복수종목 없음</div>
      </div>
    </div>

    <details class="raw">
      <summary>원문 JSON 보기</summary>
      <pre class="raw">${jsonBlock}</pre>
    </details>
  </div>
</body>
</html>`;
}

function handleRequest(
  req: import("node:http").IncomingMessage,
  url: string,
  res: import("node:http").ServerResponse
): void {
  if (url === "/" || url.startsWith("/?")) {
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
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderPage(raw, data, hrefToPaperDashboard(req)));
    return;
  }
  if (url === "/api/status") {
    const path = getMonitorStatusPathForServer();
    if (!existsSync(path)) {
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
      const raw = readFileSync(path, "utf8");
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(raw);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
}

const server = createServer((req, res) => {
  const url = req.url ?? "/";
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("method not allowed");
    return;
  }
  handleRequest(req, url.split("#")[0], res);
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
});
