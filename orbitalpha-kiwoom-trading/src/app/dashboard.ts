import type { AppConfig } from "../infra/config.js";
import type { UserSession } from "../auth/session.js";

/**
 * Console dashboard — unified entry point listing capabilities by role.
 */
export function printDashboard(session: UserSession, config: AppConfig): void {
  const lines = [
    "",
    "=== orbitalpha-kiwoom-trading — dashboard ===",
    `User: ${session.username}  role: ${session.role}`,
    `Live confirmed: ${session.liveConfirmed ? "yes" : "no"} (used when LIVE_CONFIRMATION_REQUIRED)`,
    "",
    "Available engines (separate processes / layers):",
    "  • paper  — mock market + paper loop (signals / trades JSONL)",
    "  • reports — signal/trade summaries (see npm scripts)",
    `  • live   — ${session.role === "trader" ? "REST 잔고·시세 + dry-run 가드; 실매수는 LIVE_TEST_* 가드 통과 시에만" : "disabled (viewer)"}`,
    "",
    `Auth: ${config.authEnabled ? "on" : "off (bypass)"}  LIVE_TRADING (전략 게이트): ${config.liveTradingEnabled ? "on" : "off"}  LIVE_TEST_ORDER: ${config.liveTestOrderEnabled ? "on" : "off"}`,
    "",
  ];
  console.log(lines.join("\n"));
}
