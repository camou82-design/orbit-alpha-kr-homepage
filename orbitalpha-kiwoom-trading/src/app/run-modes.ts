import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { confirmLiveTrading, getSession } from "../auth/session.js";
import type { UserSession } from "../auth/session.js";
import type { AppConfig } from "../infra/config.js";
import type { Logger } from "../infra/logger.js";
import { clockNow } from "../infra/clock.js";
import { prepareLiveEngine, runLiveDryRunSample } from "../live/live-engine.js";
import { connectKiwoom, fetchAccountInfo, fetchQuote } from "../live/kiwoom-client.js";
import {
  evaluateLiveTestOrderGuards,
  submitLiveTestBuyOrderOnce,
} from "../live/live-test-order.js";
import { getLiveTestOrdersToday } from "../live/live-test-order-state.js";
import type { LiveDryRunIntent } from "../live/live-types.js";
import {
  mergeMonitorSnapshot,
  type MonitorAccountSummary,
  type MonitorHoldingRow,
} from "../infra/monitor-snapshot.js";
import { syncEngineMirrorToLiveOpsState } from "../live/live-ops-state.js";
import type { KiwoomAccountInfoResult, KiwoomConnectResult } from "../live/kiwoom-client.js";
import {
  getEffectiveMarketSessionPhase,
  seoulWallClockForLog,
} from "../kiwoom/market-hours.js";
import { BasicUniverseFilter } from "../kiwoom/basic-universe-filter.js";
import { MockMarketDataAdapter } from "../kiwoom/mock-market-data.js";
import { preparePaperEngine, startPaperLoop } from "../paper/paper-engine.js";
import { startLiveLoop } from "../live/live-loop.js";
import {
  evaluateCashOnlyBuyFunding,
  snapshotToPlain,
} from "../live/live-order-funding.js";

export function resolveInitialEntryMode(
  config: AppConfig
): "paper" | "reports" | "live" | "menu" {
  if (config.appEntryMode) return config.appEntryMode;
  if (!config.authEnabled) return "paper";
  return "menu";
}

export async function promptEntryMode(
  session: UserSession
): Promise<"paper" | "reports" | "live"> {
  const rl = readline.createInterface({ input, output });
  try {
    const hint =
      session.role === "trader" ? "paper | reports | live" : "paper | reports";
    const raw = (await rl.question(`Select mode (${hint}): `)).trim().toLowerCase();
    if (raw === "paper" || raw === "reports") return raw;
    if (raw === "live") {
      if (session.role !== "trader") {
        console.error("Live mode requires role trader.");
        return "paper";
      }
      return "live";
    }
    console.warn("Unknown mode, defaulting to paper.");
    return "paper";
  } finally {
    rl.close();
  }
}

function buildLiveMonitorAccountSnapshot(
  connectResult: KiwoomConnectResult,
  accountQueriedAt: string,
  quoteQueriedAt: string,
  accountResult: KiwoomAccountInfoResult
): {
  connectionStatus: string;
  accountSummary: MonitorAccountSummary;
  holdings: MonitorHoldingRow[];
  accountQueriedAt: string;
  quoteQueriedAt: string;
} {
  const configured = connectResult.status !== "not_configured";
  const summary: MonitorAccountSummary =
    accountResult.ok && accountResult.accountSummary
      ? accountResult.accountSummary
      : {
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
        note: !configured
          ? "키움 연결 정보 미설정 — 합계·보유 없음"
          : "실계좌 조회 실패 또는 응답 파싱 불가 — 로그·HTS와 대조",
      };
  const holdings = accountResult.ok && accountResult.holdings ? accountResult.holdings : [];
  const connectionStatus =
    connectResult.status === "connected" ? "connected" : connectResult.status;
  return {
    connectionStatus,
    accountSummary: summary,
    holdings,
    accountQueriedAt,
    quoteQueriedAt,
  };
}

async function promptLiveConfirm(): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const line = (await rl.question('Type "CONFIRM LIVE" to enable dry-run live: ')).trim();
    return line === "CONFIRM LIVE";
  } finally {
    rl.close();
  }
}

export async function runPaperMode(logger: Logger, config: AppConfig): Promise<void> {
  const market = new MockMarketDataAdapter();
  const universe = new BasicUniverseFilter({
    minTurnoverKrw: config.universeMinTurnoverKrw,
    excludeEtfOrEtn: config.universeExcludeEtfEtn,
    excludeNonNormalStatus: config.universeExcludeNonNormal,
  });
  preparePaperEngine(logger, config);
  await startPaperLoop({ config, logger, market, universe });
}

export function runReportsMode(logger: Logger, config: AppConfig): void {
  logger.info("app.reports", {
    msg: "reports entry — use npm scripts (separate from paper/live runtimes)",
    signalsDir: config.signalsDir,
    tradesDir: config.tradesDir,
  });
  console.log("");
  console.log("Signal / trade summaries (JSONL → console or data/reports):");
  console.log("  npm run summarize-signals");
  console.log("  npm run summarize-trades");
  console.log("");
}

export async function runLiveMode(logger: Logger, config: AppConfig): Promise<void> {
  const s0 = getSession();
  if (!s0) {
    logger.error("live.session_missing");
    mergeMonitorSnapshot({ livePathError: "live.session_missing" });
    return;
  }
  if (s0.role !== "trader") {
    logger.warn("live.blocked", { reason: "role_not_trader" });
    mergeMonitorSnapshot({ livePathError: "role_not_trader" });
    return;
  }

  if (config.liveConfirmationRequired && !s0.liveConfirmed) {
    const ok = await promptLiveConfirm();
    if (!ok) {
      logger.warn("live.cancelled", { reason: "confirmation_not_received" });
      mergeMonitorSnapshot({ livePathError: "live_confirmation_not_received" });
      return;
    }
    confirmLiveTrading();
  }

  const s = getSession();
  if (!s) {
    logger.error("live.session_missing");
    mergeMonitorSnapshot({ livePathError: "live.session_missing_after_confirm" });
    return;
  }

  prepareLiveEngine(logger, config, s);
  mergeMonitorSnapshot({
    liveEngine: {
      msg: "live engine ready (strategy auto-live off; optional one-shot test buy)",
      username: s.username,
      role: s.role,
      liveConfirmed: s.liveConfirmed,
      liveTradingEnabled: config.liveTradingEnabled,
      liveTestOrderEnabled: config.liveTestOrderEnabled,
    },
  });

  const now = clockNow();
  const { effectiveSessionPhase, forcedSessionPhase } = getEffectiveMarketSessionPhase(
    now,
    config.forceSessionPhase
  );
  const seoulClock = seoulWallClockForLog(now);
  logger.info("market.session", {
    msg: "detected",
    effectiveSessionPhase,
    forcedSessionPhase,
    ts: now.toISOString(),
    ...seoulClock,
  });
  mergeMonitorSnapshot({
    marketSessionDetected: {
      msg: "detected",
      effectiveSessionPhase,
      forcedSessionPhase,
      ts: now.toISOString(),
      ...seoulClock,
    },
  });

  mergeMonitorSnapshot({ kiwoomConnectAttempt: true });
  const connectResult = await connectKiwoom(logger, config);
  mergeMonitorSnapshot({ kiwoomConnectSummary: connectResult.message });
  if (connectResult.status === "not_configured") {
    logger.info("kiwoom.connect", { msg: "skipped", detail: connectResult.message });
  } else if (connectResult.status === "connected") {
    logger.info("kiwoom.connect", { msg: "success", detail: connectResult.message });
  } else if (connectResult.status === "error") {
    logger.warn("kiwoom.connect", { msg: "error", detail: connectResult.message });
  }

  // ---------------------------------------------------------------
  // LIVE_AUTO_LOOP_ENABLED 분기
  // ---------------------------------------------------------------
  const autoLoopEnabled = process.env.LIVE_AUTO_LOOP_ENABLED === "true";

  if (autoLoopEnabled) {
    logger.info("live.loop.start", { mode: "auto-loop-enabled" });
    await startLiveLoop(config, logger);
    return; // 루프가 종료될 때까지 대기, 종료 후 리턴 (아래 기존 로직 건너뜀)
  }

  logger.info("live.auto_loop.skip", {
    msg: "auto-trading loop inactive (set LIVE_AUTO_LOOP_ENABLED=true to enable)",
  });

  // ---------------------------------------------------------------
  // 아래는 LIVE_AUTO_LOOP_ENABLED != "true" 일 때 실행되는 기존 one-shot 로직
  // ---------------------------------------------------------------
  const state = { dailyLossKrw: 0, openPositionsCount: 0 };
  const testSymbol = config.liveTestAllowedSymbol.trim() || "005930";
  const intent: LiveDryRunIntent = {
    symbol: testSymbol,
    side: "BUY",
    notionalKrw: Math.min(200_000, config.liveMaxOrderSizeKrw),
  };

  mergeMonitorSnapshot({ kiwoomAccountFetchAttempt: true });
  const accountResult = await fetchAccountInfo(logger, config);
  const accountQueriedAt = new Date().toISOString();

  mergeMonitorSnapshot({ kiwoomQuoteFetchAttempt: { symbol: intent.symbol } });
  const quoteResult = await fetchQuote(logger, config, intent.symbol);
  const quoteQueriedAt = new Date().toISOString();

  const testGuardPreview = evaluateLiveTestOrderGuards({
    config,
    session: s,
    accountResult,
    quoteResult,
    symbol: testSymbol,
    side: "BUY",
    qty: 1,
    effectiveSessionPhase,
    forcedSessionPhase,
  });

  const lp = quoteResult.lastPrice;
  const reqKrw =
    lp !== null && lp !== undefined && Number.isFinite(lp) ? Math.round(lp) : 0;
  const fundPreview = evaluateCashOnlyBuyFunding({
    accountFetchOk: accountResult.ok,
    accountSummary: accountResult.accountSummary,
    requiredKrw: reqKrw,
    accountCreditRisk: accountResult.accountSummary?.accountCreditRisk,
  });
  const eligibleWithFunding =
    testGuardPreview.ok && fundPreview.fundingGateOk;
  const blockWithFunding = fundPreview.fundingGateOk
    ? testGuardPreview.reasons
    : [...testGuardPreview.reasons, "live_order_funding_blocked"];

  mergeMonitorSnapshot({
    accountRealFetchOk: accountResult.ok,
    quoteRealFetchOk: quoteResult.ok,
    liveTestOrderEligible: eligibleWithFunding,
    liveTestOrderBlockReasons: blockWithFunding,
    liveTestOrdersToday: getLiveTestOrdersToday(),
    liveOrderFunding: snapshotToPlain(fundPreview),
    ...buildLiveMonitorAccountSnapshot(
      connectResult,
      accountQueriedAt,
      quoteQueriedAt,
      accountResult
    ),
  });

  const guard = runLiveDryRunSample(logger, config, s, state, intent);
  mergeMonitorSnapshot({
    liveDryRun: {
      intent,
      allowed: guard.allowed,
      reasons: guard.reasons,
      state: { ...state },
    },
    liveDryRunDecision: {
      allowed: guard.allowed,
      reasons: guard.reasons,
      intent,
    },
    dryRunBlockReasons: guard.reasons,
  });

  syncEngineMirrorToLiveOpsState({
    liveTradingEnabled: config.liveTradingEnabled,
    liveConfirmationRequired: config.liveConfirmationRequired,
    effectiveSessionPhase,
    forcedSessionPhase,
    liveStrategyGate: config.liveTradingEnabled,
    blockReasons: guard.reasons,
    testBlockReasons: blockWithFunding,
  });

  await submitLiveTestBuyOrderOnce({
    logger,
    config,
    session: s,
    accountResult,
    quoteResult,
    effectiveSessionPhase,
    forcedSessionPhase,
  });
}
