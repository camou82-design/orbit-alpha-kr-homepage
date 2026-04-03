import type { AppConfig } from "../infra/config.js";
import type { Logger } from "../infra/logger.js";
import type { UserSession } from "../auth/session.js";
import { evaluateLiveGuard } from "./live-guard.js";
import type { LiveDryRunIntent, LiveGuardResult, LiveGuardState } from "./live-types.js";

/**
 * Live execution shell (separate from paper-engine). No broker / no real orders.
 */
export function prepareLiveEngine(
  logger: Logger,
  config: AppConfig,
  session: UserSession
): void {
  logger.info("live.engine", {
    msg: "live engine ready (strategy auto-live off; optional one-shot test buy path only)",
    username: session.username,
    role: session.role,
    liveConfirmed: session.liveConfirmed,
    liveTradingEnabled: config.liveTradingEnabled,
    liveTestOrderEnabled: config.liveTestOrderEnabled,
    note: "no strategy-driven broker orders; see LIVE_TEST_* env for guarded test buy",
  });
}

/**
 * Legacy hook — does not call the broker. Real money path is `submitLiveTestBuyOrderOnce`
 * in `live-test-order.ts` (guarded one-shot BUY only).
 */
export function submitLiveOrderNotImplemented(
  logger: Logger,
  _config: AppConfig,
  label: string
): void {
  logger.warn("live.order", {
    msg: "submitLiveOrderNotImplemented — no broker call; use submitLiveTestBuyOrderOnce for guarded test buy",
    label,
  });
}

/**
 * Emits a single dry-run log line — does not call any order API.
 */
export function runLiveDryRunSample(
  logger: Logger,
  config: AppConfig,
  session: UserSession,
  state: LiveGuardState,
  intent: LiveDryRunIntent
): LiveGuardResult {
  const guard = evaluateLiveGuard({ config, session, state, intent });
  logger.info("live.dry_run", {
    intent,
    allowed: guard.allowed,
    reasons: guard.reasons,
    state: { ...state },
  });
  logger.info("live.dry_run.decision", {
    allowed: guard.allowed,
    reasons: guard.reasons,
    intent,
  });
  return guard;
}
