import "dotenv/config";
/**
 * Paper-only dashboard: reads data/paper-dashboard.json written by the paper loop.
 * No broker, no live Kiwoom, no orders — browse-only on 127.0.0.1.
 */
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import type {
  PaperCandidateRow,
  PaperDashboardSnapshot,
  PaperFillRow,
  PaperPositionRow,
} from "../infra/paper-dashboard-snapshot.js";
import { getPaperDashboardPathForServer } from "../infra/paper-dashboard-snapshot.js";
import { hrefToLiveMonitor } from "../infra/cross-nav-links.js";
import { formatMarketSessionKorean } from "../infra/live-ops-banner.js";
import {
  dashboardDefaultReturnPathPaper,
  dashboardHttpAuthEnabled,
  dashboardSessionSecretOk,
  requireDashboardSession,
  sendNoStoreHeaders,
  tryDashboardAuthRoutes,
} from "../infra/dashboard-http-auth.js";

const HOST = process.env.PAPER_DASHBOARD_HOST?.trim() || "127.0.0.1";
const PORT = Number(process.env.PAPER_DASHBOARD_PORT ?? 3002);
const REFRESH_SEC = 4;
const TITLE = "급등주 모의매매 (PAPER)";

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

function pnlClass(n: number): string {
  if (n > 0) return "pnl-up";
  if (n < 0) return "pnl-down";
  return "pnl-zero";
}

function defaultSnapshot(): PaperDashboardSnapshot {
  return {
    schemaVersion: 1,
    lastUpdated: new Date(0).toISOString(),
    paperOnly: true,
    experimentTag: null,
    tickIndex: 0,
    effectiveSessionPhase: "—",
    paperTradingEnabled: false,
    candidates: [],
    positions: [],
    recentFills: [],
  };
}

function loadSnapshot(): PaperDashboardSnapshot {
  const path = getPaperDashboardPathForServer();
  if (!existsSync(path)) return defaultSnapshot();
  try {
    const t = readFileSync(path, "utf8");
    const j = JSON.parse(t) as PaperDashboardSnapshot;
    if (!j || j.paperOnly !== true) return defaultSnapshot();
    return j;
  } catch {
    return defaultSnapshot();
  }
}

function renderCandidates(rows: PaperCandidateRow[]): string {
  if (rows.length === 0) {
    return `<tr><td colspan="7" class="empty">후보 없음 — paper 엔진을 실행하면 갱신됩니다.</td></tr>`;
  }
  return rows
    .map(
      (r) => `<tr>
  <td class="t-left">${esc(r.name)}</td>
  <td>${esc(r.symbol)}</td>
  <td class="t-num">${fmtKrw(r.lastPrice)}</td>
  <td class="t-num">${String(r.score)}</td>
  <td>${r.entrySignal ? "예" : "아니오"}</td>
  <td class="t-left small">${esc(r.entryReason)}</td>
  <td class="t-left small">${esc(r.blockReason)}</td>
</tr>`
    )
    .join("\n");
}

function renderPositions(rows: PaperPositionRow[]): string {
  if (rows.length === 0) {
    return `<tr><td colspan="6" class="empty">보유 없음</td></tr>`;
  }
  return rows
    .map(
      (r) => `<tr>
  <td class="t-left">${esc(r.name)}</td>
  <td class="t-num">${fmtKrw(r.quantity)}</td>
  <td class="t-num">${fmtKrw(r.avgBuyPrice)}</td>
  <td class="t-num">${fmtKrw(r.lastPrice)}</td>
  <td class="t-num ${pnlClass(r.evalPnlKrw)}">${fmtKrw(r.evalPnlKrw)}</td>
  <td class="t-num ${pnlClass(r.returnPct)}">${fmtPct(r.returnPct)}</td>
</tr>`
    )
    .join("\n");
}

function renderFills(rows: PaperFillRow[]): string {
  if (rows.length === 0) {
    return `<tr><td colspan="7" class="empty">체결 없음</td></tr>`;
  }
  const ordered = [...rows].reverse();
  return ordered
    .map(
      (r) => `<tr>
  <td class="t-num">${esc(r.time)}</td>
  <td class="t-left">${esc(r.name)}</td>
  <td>${esc(r.symbol)}</td>
  <td><strong>${esc(r.action)}</strong></td>
  <td class="t-num">${fmtKrw(r.price)}</td>
  <td class="t-num">${fmtKrw(r.quantity)}</td>
  <td class="t-left small">${esc(r.reason)}</td>
</tr>`
    )
    .join("\n");
}

function renderPage(data: PaperDashboardSnapshot, rawJson: string, hrefLive: string): string {
  const sessionKo = formatMarketSessionKorean(data.effectiveSessionPhase);
  const meta = [
    `tick ${data.tickIndex}`,
    data.experimentTag ? `tag ${data.experimentTag}` : "tag —",
    data.paperTradingEnabled ? "PAPER_TRADING on" : "PAPER_TRADING off",
  ].join(" · ");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="${REFRESH_SEC}" />
  <title>${esc(TITLE)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Malgun Gothic","맑은 고딕",Dotum,sans-serif; font-size: 13px; color: #222; background: #e8edf2; }
    .banner {
      position: sticky; top: 0; z-index: 10;
      background: #1a3a52; color: #fff; padding: 0.5rem 1rem;
      border-bottom: 3px solid #c9a227;
    }
    .banner strong { font-size: 15px; letter-spacing: 0.04em; }
    .banner .sub { font-size: 11px; opacity: 0.92; margin-top: 0.2rem; }
    .banner-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.45rem;
    }
    a.banner-link {
      display: inline-block;
      padding: 0.28rem 0.6rem;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(201, 162, 39, 0.65);
      border-radius: 3px;
      text-decoration: none;
      white-space: nowrap;
    }
    a.banner-link:hover { background: rgba(255, 255, 255, 0.18); }
    .btn-row { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; justify-content: flex-end; }
    button.banner-btn {
      display: inline-block;
      padding: 0.28rem 0.6rem;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(201, 162, 39, 0.65);
      border-radius: 3px;
      cursor: pointer;
      font-family: inherit;
    }
    button.banner-btn:hover { background: rgba(255, 255, 255, 0.18); }
    .wrap { max-width: 1280px; margin: 0 auto; padding: 0.6rem 1rem 1.2rem; }
    .panel-title {
      background: #d9dee6; border: 1px solid #b8c0cc; border-bottom: none;
      padding: 0.35rem 0.5rem; font-weight: 700; font-size: 12px; margin-top: 0.5rem;
    }
    .table-wrap { overflow-x: auto; border: 1px solid #b8c0cc; background: #fff; margin-bottom: 0.25rem; }
    table.grid { width: 100%; border-collapse: collapse; font-size: 12px; }
    table.grid th {
      background: #f0f2f5; border: 1px solid #d0d6de; padding: 0.35rem 0.3rem; font-weight: 600; white-space: nowrap;
    }
    table.grid td {
      border: 1px solid #e2e6ec; padding: 0.35rem 0.3rem; text-align: right;
    }
    table.grid td.t-left { text-align: left; }
    table.grid td.t-num { font-family: Consolas, monospace; }
    table.grid td.small { font-size: 11px; color: #333; }
    .empty { text-align: center !important; color: #555; padding: 0.75rem !important; }
    .pnl-up { color: #c62828; font-weight: 600; }
    .pnl-down { color: #1565c0; font-weight: 600; }
    .pnl-zero { color: #333; }
    .foot { font-size: 11px; color: #555; margin-top: 0.5rem; }
    details.raw { margin-top: 0.6rem; }
    details.raw summary { cursor: pointer; color: #444; font-size: 12px; }
    pre.raw { margin: 0.35rem 0 0; padding: 0.5rem; background: #1e1e1e; color: #d4d4d4; border-radius: 4px; overflow: auto; font-size: 10px; max-height: 14rem; }
  </style>
</head>
<body>
  <div class="banner">
    <div class="banner-row">
      <div><strong>PAPER ONLY</strong> — 실계좌·실주문과 완전 분리 · 키움 실주문 없음 · 모의 시뮬레이션 전용 (운영 중에도 LIVE와 혼동 금지)</div>
      <div class="btn-row">
        <a class="banner-link" href="${esc(hrefLive)}">LIVE 계좌 모니터로 이동</a>
        <button type="button" class="banner-btn" id="btnLogout">로그아웃</button>
      </div>
    </div>
    <div class="sub"><strong>현재 상태:</strong> ${esc(sessionKo)} · ${esc(TITLE)} · 자동 갱신 약 ${String(REFRESH_SEC)}초 · ${esc(meta)} · 갱신 ${esc(data.lastUpdated)}</div>
  </div>
  <div class="wrap">
    <div class="panel-title">급등주 후보</div>
    <div class="table-wrap">
      <table class="grid">
        <thead>
          <tr>
            <th>종목명</th><th>종목코드</th><th>현재가</th><th>점수</th><th>진입 신호</th><th>진입 사유</th><th>차단 사유</th>
          </tr>
        </thead>
        <tbody>
          ${renderCandidates(data.candidates ?? [])}
        </tbody>
      </table>
    </div>

    <div class="panel-title">모의 보유</div>
    <div class="table-wrap">
      <table class="grid">
        <thead>
          <tr>
            <th>종목명</th><th>보유수량</th><th>평균매입가</th><th>현재가</th><th>평가손익</th><th>수익률</th>
          </tr>
        </thead>
        <tbody>
          ${renderPositions(data.positions ?? [])}
        </tbody>
      </table>
    </div>

    <div class="panel-title">최근 모의 체결</div>
    <div class="table-wrap">
      <table class="grid">
        <thead>
          <tr>
            <th>시간</th><th>종목명</th><th>코드</th><th>액션</th><th>가격</th><th>수량</th><th>이유</th>
          </tr>
        </thead>
        <tbody>
          ${renderFills(data.recentFills ?? [])}
        </tbody>
      </table>
    </div>

    <p class="foot">데이터: <code>${esc(getPaperDashboardPathForServer())}</code> · 포트 <code>${String(PORT)}</code> (<code>PAPER_DASHBOARD_PORT</code>)</p>

    <details class="raw">
      <summary>원본 JSON (디버그)</summary>
      <pre class="raw">${escPre(rawJson)}</pre>
    </details>
  </div>
  <script>
(function(){
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

async function handlePaperRequest(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse
): Promise<void> {
  const rawUrl = req.url ?? "/";
  const p = pathOnly(rawUrl);
  const qs = queryString(rawUrl);

  if (await tryDashboardAuthRoutes(req, res, p, qs, dashboardDefaultReturnPathPaper()))
    return;

  if (p === "/api/paper-dashboard") {
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("method not allowed");
      return;
    }
    if (!requireDashboardSession(req, res, dashboardDefaultReturnPathPaper())) return;
    const data = loadSnapshot();
    if (dashboardHttpAuthEnabled()) sendNoStoreHeaders(res);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data, null, 2));
    return;
  }
  if (p === "/" || p === "/index.html") {
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("method not allowed");
      return;
    }
    if (!requireDashboardSession(req, res, dashboardDefaultReturnPathPaper())) return;
    const data = loadSnapshot();
    const rawJson = JSON.stringify(data, null, 2);
    if (dashboardHttpAuthEnabled()) sendNoStoreHeaders(res);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderPage(data, rawJson, hrefToLiveMonitor(req)));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
}

const server = createServer((req, res) => {
  void handlePaperRequest(req, res).catch((e) => {
    console.error("[paper-dashboard] request error:", e);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("internal error");
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[paper-dashboard] ${TITLE}`);
  console.log(`[paper-dashboard] http://${HOST}:${PORT}/  (read-only, paper JSON only)`);
  console.log(`[paper-dashboard] file: ${getPaperDashboardPathForServer()}`);
  if (dashboardHttpAuthEnabled() && !dashboardSessionSecretOk()) {
    console.warn(
      "[paper-dashboard] KIWOOM_DASHBOARD_HTTP_AUTH is on but KIWOOM_DASHBOARD_SESSION_SECRET is missing or too short (min 16)."
    );
  }
});
