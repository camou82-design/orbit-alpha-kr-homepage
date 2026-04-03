import { createBypassSession, type UserSession } from "../auth/session.js";
import { loadConfig } from "../infra/config.js";
import {
  isKiwoomConnectionConfigured,
  validateStartupConfig,
} from "../infra/config-validation.js";
import { createLogger } from "../infra/logger.js";
import { printDashboard } from "./dashboard.js";
import { runLoginPrompt } from "./login.js";
import {
  promptEntryMode,
  resolveInitialEntryMode,
  runLiveMode,
  runPaperMode,
  runReportsMode,
} from "./run-modes.js";
import { mergeMonitorSnapshot } from "../infra/monitor-snapshot.js";
import { printLaunchConfigBanner, printLaunchModeBanner } from "./launch-banner.js";
import {
  buildConfigLoadedSnapshot,
  printConfigDiagnostics,
} from "./config-diagnostics.js";

async function main(): Promise<void> {
  const config = loadConfig();
  printConfigDiagnostics(config);
  const startup = validateStartupConfig(config);
  if (!startup.ok) {
    for (const err of startup.errors) {
      console.error(`[config] ${err}`);
    }
    mergeMonitorSnapshot({
      appRunning: false,
      pid: process.pid,
      startupError: startup.errors.join(" | "),
    });
    process.exitCode = 1;
    return;
  }

  mergeMonitorSnapshot({ appRunning: true, pid: process.pid });

  printLaunchConfigBanner(config);

  const logger = createLogger(config);

  logger.info("config.loaded", {
    msg: "config loaded",
    appName: config.appName,
    appEnv: config.appEnv,
    kiwoomMode: config.kiwoomMode,
    paperTrading: config.paperTrading,
    authEnabled: config.authEnabled,
    appEntryMode: config.appEntryMode,
    liveTradingEnabled: config.liveTradingEnabled,
    kiwoomConnectionConfigured: isKiwoomConnectionConfigured(config),
  });
  mergeMonitorSnapshot({
    configLoaded: buildConfigLoadedSnapshot(config),
  });

  logger.info("auth.mode", {
    msg: "auth mode",
    authEnabled: config.authEnabled,
  });
  mergeMonitorSnapshot({
    authMode: { authEnabled: config.authEnabled },
  });

  logger.info("app.start", {
    appEnv: config.appEnv,
    kiwoomMode: config.kiwoomMode,
    paperTrading: config.paperTrading,
    authEnabled: config.authEnabled,
  });

  let session: UserSession;
  if (!config.authEnabled) {
    session = createBypassSession(config);
  } else {
    const s = await runLoginPrompt(config);
    if (!s) {
      mergeMonitorSnapshot({ appRunning: false, startupError: "login_failed" });
      process.exitCode = 1;
      return;
    }
    session = s;
  }

  logger.info("session.current", {
    msg: "current role",
    username: session.username,
    role: session.role,
  });
  mergeMonitorSnapshot({
    sessionCurrent: { username: session.username, role: session.role },
  });

  printDashboard(session, config);
  logger.info("dashboard.ready", { msg: "dashboard ready" });
  mergeMonitorSnapshot({ dashboardReady: true });

  const initial = resolveInitialEntryMode(config);
  const mode: "paper" | "reports" | "live" =
    initial === "menu" ? await promptEntryMode(session) : initial;

  mergeMonitorSnapshot({ entryMode: mode });
  printLaunchModeBanner(config, mode, session);

  if (mode === "paper") {
    await runPaperMode(logger, config);
  } else if (mode === "reports") {
    runReportsMode(logger, config);
  } else if (mode === "live") {
    await runLiveMode(logger, config);
  }

  mergeMonitorSnapshot({ appRunning: false });
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    mergeMonitorSnapshot({ appRunning: false });
  });
}

main().catch((err) => {
  console.error(err);
  mergeMonitorSnapshot({
    appRunning: false,
    startupError: err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
});
