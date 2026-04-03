import type { AppConfig } from "../infra/config.js";
import { isKiwoomConnectionConfigured } from "../infra/config-validation.js";
import { getMonitorStatusPathForServer } from "../infra/monitor-snapshot.js";

const REQUIRED_CONFIRM = "EXECUTE_TEST_BUY_ONCE";

/**
 * One block of operator-facing env vs effective config (stdout).
 * Use to verify .env is loaded and cwd matches monitor snapshot file.
 */
export function printConfigDiagnostics(config: AppConfig): void {
  const raw = {
    APP_ENTRY_MODE: process.env.APP_ENTRY_MODE,
    AUTH_ENABLED: process.env.AUTH_ENABLED,
    AUTH_BYPASS_ROLE: process.env.AUTH_BYPASS_ROLE,
    LIVE_TRADING_ENABLED: process.env.LIVE_TRADING_ENABLED,
    LIVE_TEST_ORDER_ENABLED: process.env.LIVE_TEST_ORDER_ENABLED,
    LIVE_TEST_ALLOWED_SYMBOL: process.env.LIVE_TEST_ALLOWED_SYMBOL,
    LIVE_TEST_ORDER_CONFIRM: process.env.LIVE_TEST_ORDER_CONFIRM
      ? "(set, hidden)"
      : "(empty)",
    LIVE_TEST_MAX_QTY: process.env.LIVE_TEST_MAX_QTY,
    LIVE_TEST_MAX_ORDERS_PER_DAY: process.env.LIVE_TEST_MAX_ORDERS_PER_DAY,
    FORCE_SESSION_PHASE: process.env.FORCE_SESSION_PHASE,
  };

  console.log("");
  console.log("[config.diagnostic] env (raw strings from process.env)");
  console.log(JSON.stringify(raw, null, 2));
  console.log("[config.diagnostic] effective (after loadConfig)");
  console.log(
    JSON.stringify(
      {
        appEntryMode: config.appEntryMode,
        authEnabled: config.authEnabled,
        authBypassRole: config.authBypassRole,
        liveTradingEnabled: config.liveTradingEnabled,
        liveTestOrderEnabled: config.liveTestOrderEnabled,
        liveTestMaxQty: config.liveTestMaxQty,
        liveTestMaxOrdersPerDay: config.liveTestMaxOrdersPerDay,
        liveTestAllowedSymbol: config.liveTestAllowedSymbol,
        liveTestOrderConfirmMatches:
          config.liveTestOrderConfirm === REQUIRED_CONFIRM,
        forceSessionPhase: config.forceSessionPhase,
      },
      null,
      2
    )
  );
  console.log(
    `[config.diagnostic] monitor snapshot file (engine cwd): ${getMonitorStatusPathForServer()}`
  );
  console.log(`[config.diagnostic] process.cwd(): ${process.cwd()}`);
  console.log(
    "[config.diagnostic] raw vs effective: LIVE_TRADING uses bool(env); if unset → false. No extra override in loadConfig."
  );
  console.log("");
}

/** Fields merged into monitor-status.json `configLoaded` for cross-check with UI/API. */
export function buildConfigLoadedSnapshot(config: AppConfig): Record<string, unknown> {
  const confirm = config.liveTestOrderConfirm;
  return {
    msg: "config loaded",
    appName: config.appName,
    appEnv: config.appEnv,
    kiwoomMode: config.kiwoomMode,
    paperTrading: config.paperTrading,
    authEnabled: config.authEnabled,
    appEntryMode: config.appEntryMode,
    authBypassRole: config.authBypassRole,
    liveTradingEnabled: config.liveTradingEnabled,
    liveTradingEnabledRaw: process.env.LIVE_TRADING_ENABLED ?? "",
    liveTestOrderEnabled: config.liveTestOrderEnabled,
    liveTestOrderEnabledRaw: process.env.LIVE_TEST_ORDER_ENABLED ?? "",
    liveTestMaxQty: config.liveTestMaxQty,
    liveTestMaxOrdersPerDay: config.liveTestMaxOrdersPerDay,
    liveTestAllowedSymbol: config.liveTestAllowedSymbol,
    liveTestOrderConfirmPresent: confirm.length > 0,
    liveTestOrderConfirmMatchesRequired: confirm === REQUIRED_CONFIRM,
    forceSessionPhaseEffective: config.forceSessionPhase,
    forceSessionPhaseRaw: process.env.FORCE_SESSION_PHASE ?? "",
    snapshotCwd: process.cwd(),
    monitorStatusFilePath: getMonitorStatusPathForServer(),
    kiwoomConnectionConfigured: isKiwoomConnectionConfigured(config),
  };
}
