import type { AppConfig } from "../infra/config.js";
import type { UserSession } from "../auth/session.js";
import type { LiveDryRunIntent, LiveGuardResult, LiveGuardState } from "./live-types.js";

export interface LiveGuardInput {
  config: AppConfig;
  session: UserSession;
  state: LiveGuardState;
  intent: LiveDryRunIntent;
}

/**
 * Pre-trade checks for live mode (dry-run path uses the same rules).
 * Never place orders here — callers must not invoke broker APIs while `liveTradingEnabled` is false.
 */
export function evaluateLiveGuard(input: LiveGuardInput): LiveGuardResult {
  const { config, session, state, intent } = input;
  const reasons: string[] = [];

  if (!config.liveTradingEnabled) {
    reasons.push("live_trading_disabled");
  }
  if (session.role !== "trader") {
    reasons.push("role_not_trader");
  }
  if (config.liveConfirmationRequired && !session.liveConfirmed) {
    reasons.push("live_not_confirmed");
  }
  if (state.dailyLossKrw >= config.liveMaxDailyLossKrw) {
    reasons.push("daily_loss_limit");
  }
  if (intent.notionalKrw > config.liveMaxOrderSizeKrw) {
    reasons.push("order_size_limit");
  }
  if (state.openPositionsCount >= config.liveMaxOpenPositions) {
    reasons.push("max_open_positions");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
