import type { AppConfig } from "../infra/config.js";
import type { Logger } from "../infra/logger.js";
import type { UserSession } from "../auth/session.js";
import {
  fetchKiwoomAccessToken,
  isKiwoomTrBusinessOk,
  kiwoomTrPost,
  type KiwoomTrPostResult,
} from "../kiwoom/kiwoom-rest.js";
import type { KiwoomAccountInfoResult, KiwoomQuoteResult } from "./kiwoom-client.js";
import { isKiwoomConnectionConfigured } from "../infra/config-validation.js";
import {
  getLiveTestOrdersToday,
  incrementLiveTestOrdersToday,
} from "./live-test-order-state.js";
import { mergeMonitorSnapshot } from "../infra/monitor-snapshot.js";
import { evaluateScore } from "../core/scoring.js";
import { evaluateLiveOperationalOrderGate } from "./live-ops-guard.js";
import { recordOrderAttempt, recordOrderBrokerResult } from "./live-ops-state.js";
import {
  evaluateCashOnlyBuyFunding,
  snapshotToPlain,
} from "./live-order-funding.js";

/** Must match `LIVE_TEST_ORDER_CONFIRM` env exactly to allow a real test buy. */
export const LIVE_TEST_ORDER_CONFIRM_VALUE = "EXECUTE_TEST_BUY_ONCE";

export interface LiveTestOrderGuardInput {
  config: AppConfig;
  session: UserSession;
  accountResult: KiwoomAccountInfoResult;
  quoteResult: KiwoomQuoteResult;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  effectiveSessionPhase: string;
  forcedSessionPhase: boolean;
}

export interface LiveTestOrderGuardOutcome {
  ok: boolean;
  reasons: string[];
}

export function evaluateLiveTestOrderGuards(
  input: LiveTestOrderGuardInput
): LiveTestOrderGuardOutcome {
  const {
    config,
    session,
    accountResult,
    quoteResult,
    symbol,
    side,
    qty,
    effectiveSessionPhase,
    forcedSessionPhase,
  } = input;
  const reasons: string[] = [];

  if (!config.liveTradingEnabled) reasons.push("live_trading_disabled");
  if (!config.liveTestOrderEnabled) reasons.push("live_test_order_disabled");
  if (config.liveTestMaxQty !== 1) reasons.push("live_test_max_qty_must_be_1");
  if (config.liveTestMaxOrdersPerDay !== 1) {
    reasons.push("live_test_max_orders_per_day_must_be_1");
  }
  if (!config.liveTestAllowedSymbol.trim()) {
    reasons.push("live_test_allowed_symbol_missing");
  } else if (config.liveTestAllowedSymbol.trim() !== symbol.trim()) {
    reasons.push("symbol_not_allowed_for_live_test");
  }
  if (config.liveTestOrderConfirm.trim() !== LIVE_TEST_ORDER_CONFIRM_VALUE) {
    reasons.push("live_test_order_confirm_not_set_or_invalid");
  }
  if (effectiveSessionPhase !== "REGULAR") {
    reasons.push("not_regular_session");
  }
  if (forcedSessionPhase) {
    reasons.push("session_phase_forced_dev_not_allowed_for_live_test");
  }
  if (side !== "BUY") reasons.push("side_must_be_buy");
  if (qty !== 1) reasons.push("qty_must_be_1");
  if (!isKiwoomConnectionConfigured(config)) {
    reasons.push("kiwoom_not_configured");
  }
  if (session.role !== "trader") reasons.push("role_not_trader");
  if (config.liveConfirmationRequired && !session.liveConfirmed) {
    reasons.push("live_not_confirmed");
  }
  if (!accountResult.ok) reasons.push("account_fetch_not_ok");
  if (!quoteResult.ok || quoteResult.lastPrice === null || quoteResult.lastPrice === undefined) {
    reasons.push("quote_missing_or_invalid_price");
  }
  const todayCount = getLiveTestOrdersToday();
  if (todayCount >= config.liveTestMaxOrdersPerDay) {
    reasons.push("live_test_daily_order_limit_reached");
  }

  return { ok: reasons.length === 0, reasons };
}

export interface SubmitLiveTestBuyOrderContext {
  logger: Logger;
  config: AppConfig;
  session: UserSession;
  accountResult: KiwoomAccountInfoResult;
  quoteResult: KiwoomQuoteResult;
  effectiveSessionPhase: string;
  forcedSessionPhase: boolean;
}

function logBlocked(logger: Logger, reasons: string[]): void {
  for (const reason of reasons) {
    logger.warn("live.order.blocked", { msg: "live order blocked reason", reason });
  }
}

/**
 * Single guarded path for a 1-share limit BUY on the configured symbol.
 * Not invoked from loops or strategy — only from an explicit live-mode hook.
 */
export async function submitLiveTestBuyOrderOnce(
  ctx: SubmitLiveTestBuyOrderContext
): Promise<void> {
  const { logger, config, session, accountResult, quoteResult } = ctx;
  const symbol = config.liveTestAllowedSymbol.trim();

  const opGate = evaluateLiveOperationalOrderGate(config, {
    symbol,
    side: "BUY",
  });
  if (!opGate.ok) {
    logBlocked(logger, opGate.reasons.map((r) => `ops_${r}`));
    mergeMonitorSnapshot({
      liveTestOrderEligible: false,
      liveTestOrderBlockReasons: opGate.reasons.map((r) => `ops_${r}`),
      lastLiveTestOrderResult: {
        phase: "blocked",
        reasons: opGate.reasons,
        reasonKo: opGate.reasonKoLine,
      },
    });
    return;
  }

  const guard = evaluateLiveTestOrderGuards({
    config,
    session,
    accountResult,
    quoteResult,
    symbol,
    side: "BUY",
    qty: 1,
    effectiveSessionPhase: ctx.effectiveSessionPhase,
    forcedSessionPhase: ctx.forcedSessionPhase,
  });

  if (!guard.ok) {
    mergeMonitorSnapshot({
      liveTestOrderEligible: false,
      liveTestOrderBlockReasons: guard.reasons,
      liveTestOrdersToday: getLiveTestOrdersToday(),
    });
    logBlocked(logger, guard.reasons);
    mergeMonitorSnapshot({
      lastLiveTestOrderResult: { phase: "blocked", reasons: guard.reasons },
    });
    return;
  }

  const price = quoteResult.lastPrice;
  if (price === null || price === undefined || !Number.isFinite(price)) {
    logger.warn("live.order.blocked", {
      msg: "live order blocked reason",
      reason: "quote_price_invalid",
    });
    mergeMonitorSnapshot({
      liveTestOrderEligible: false,
      liveTestOrderBlockReasons: guard.reasons,
      liveTestOrdersToday: getLiveTestOrdersToday(),
      lastLiveTestOrderResult: { phase: "blocked", reasons: ["quote_price_invalid"] },
    });
    return;
  }

  const requiredKrw = Math.round(price);
  const fund = evaluateCashOnlyBuyFunding({
    accountFetchOk: accountResult.ok,
    accountSummary: accountResult.accountSummary,
    requiredKrw,
    accountCreditRisk: accountResult.accountSummary?.accountCreditRisk,
  });

  mergeMonitorSnapshot({
    liveTestOrderEligible: guard.ok && fund.fundingGateOk,
    liveTestOrderBlockReasons: fund.fundingGateOk
      ? guard.reasons
      : [...guard.reasons, "live_order_funding_blocked"],
    liveTestOrdersToday: getLiveTestOrdersToday(),
    liveOrderFunding: snapshotToPlain(fund),
  });

  if (!fund.fundingGateOk) {
    logger.warn("live.order.blocked", {
      msg: "live order blocked reason",
      reason: "live_order_funding_blocked",
      reasonKo: fund.reasonKo,
    });
    mergeMonitorSnapshot({
      lastLiveTestOrderResult: {
        phase: "blocked",
        reasons: ["live_order_funding_blocked"],
        reasonKo: fund.reasonKo,
      },
    });
    return;
  }

  const token = await fetchKiwoomAccessToken(config);
  if (!token.ok) {
    logger.warn("live.order.blocked", {
      msg: "live order blocked reason",
      reason: "oauth_failed_before_order",
    });
    mergeMonitorSnapshot({
      lastLiveTestOrderResult: { phase: "blocked", reasons: ["oauth_failed_before_order"] },
    });
    return;
  }

  // Strategy context logging for visibility (pre-execution review requirement)
  const strategyEval = evaluateScore({
    price,
    prevClose: quoteResult.prevClose ?? 0,
    turnover: quoteResult.turnover ?? 0,
    isTradable: true,
  });

  const ordUv = String(Math.round(price));
  const body: Record<string, unknown> = {
    dmst_stex_tp: "KRX",
    stk_cd: symbol,
    ord_qty: "1",
    ord_uv: ordUv,
    trde_tp: "0",
  };

  logger.info("live.order.test.attempt", {
    msg: "live order test submit attempt",
    symbol,
    qty: 1,
    ord_uv: ordUv,
    trde_tp: "0",
    strategy_score: strategyEval.score,
    strategy_reason: strategyEval.reason,
  });

  recordOrderAttempt();

  const tr: KiwoomTrPostResult = await kiwoomTrPost(
    config,
    token.accessToken,
    config.kiwoomRestOrdrPath,
    config.kiwoomTrBuyId,
    body
  );

  logger.info("live.order.broker", {
    msg: "live order broker response",
    ok: tr.ok,
    httpStatus: tr.httpStatus,
    body: tr.json,
  });

  const businessOk = isKiwoomTrBusinessOk(tr.json);
  const accepted = tr.ok && businessOk;

  recordOrderBrokerResult({ ok: tr.ok, accepted });

  logger.info("live.order.final", {
    msg: accepted ? "live order final accepted" : "live order final rejected",
    accepted,
  });

  if (accepted) {
    const st = incrementLiveTestOrdersToday();
    mergeMonitorSnapshot({
      liveTestOrdersToday: st.count,
      lastLiveTestOrderResult: {
        phase: "accepted",
        symbol,
        ord_uv: ordUv,
        broker: tr.json,
      },
    });
  } else {
    mergeMonitorSnapshot({
      lastLiveTestOrderResult: {
        phase: "rejected",
        httpStatus: tr.httpStatus,
        broker: tr.json,
      },
    });
  }
}
