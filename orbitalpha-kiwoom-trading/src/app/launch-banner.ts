import type { UserSession } from "../auth/session.js";
import type { AppConfig } from "../infra/config.js";

/** Short operator-facing lines at startup (stdout, not structured logger). */
export function printLaunchConfigBanner(config: AppConfig): void {
  const monitorPort = process.env.MONITOR_PORT?.trim() || "3001";
  const monitorUrl = `http://127.0.0.1:${monitorPort}`;

  console.log("");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  ${config.appName}`);
  console.log("──────────────────────────────────────────────────────────");
  console.log(
    `  AUTH: ${config.authEnabled ? "ON (login)" : "OFF"} · ${
      config.authEnabled
        ? "no bypass"
        : `bypass · AUTH_BYPASS_ROLE=${config.authBypassRole}`
    }`
  );
  console.log(
    `  APP_ENTRY_MODE: ${config.appEntryMode ?? "(default: paper if auth off, else menu)"}`
  );
  console.log(`  LIVE_TRADING_ENABLED: ${config.liveTradingEnabled}`);
  console.log(`  LIVE_TEST_ORDER_ENABLED: ${config.liveTestOrderEnabled}`);
  console.log(`  Monitor: ${monitorUrl}   (npm run monitor | npm run live:all)`);
  console.log("──────────────────────────────────────────────────────────");
  console.log("  전략 자동 실주문: 비활성 · 실주문은 제한된 테스트 경로만");
  console.log("══════════════════════════════════════════════════════════");
  console.log("");
}

export function printLaunchModeBanner(
  config: AppConfig,
  mode: "paper" | "reports" | "live",
  session: UserSession
): void {
  const modeLabel: Record<typeof mode, string> = {
    paper: "paper · mock loop (실주문 없음)",
    reports: "reports · 요약 스크립트 안내",
    live:
      "live · REST 잔고/시세 + dry-run 가드 (제한적 테스트 주문은 LIVE_TEST_* 가드 시에만)",
  };

  console.log("──────────────────────────────────────────────────────────");
  console.log(`  [RUN] mode=${mode} — ${modeLabel[mode]}`);
  console.log(`  [RUN] role=${session.role} · liveConfirmed=${session.liveConfirmed}`);
  if (mode === "live") {
    console.log(
      `  [RUN] LIVE_TRADING=${config.liveTradingEnabled} · LIVE_TEST_ORDER=${config.liveTestOrderEnabled}`
    );
  }
  console.log("══════════════════════════════════════════════════════════");
  console.log("");
}
