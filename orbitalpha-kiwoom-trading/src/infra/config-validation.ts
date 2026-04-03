import type { AppConfig } from "./config.js";

/** True when live Kiwoom wiring env vars are present (values not logged). */
export function isKiwoomConnectionConfigured(config: AppConfig): boolean {
  return (
    config.kiwoomAccountNo.trim() !== "" &&
    config.kiwoomApiKey.trim() !== "" &&
    config.kiwoomApiSecret.trim() !== ""
  );
}

/**
 * Startup checks before login. Exits the process on failure (caller runs exit).
 */
export function validateStartupConfig(config: AppConfig): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.authEnabled) {
    if (
      config.adminPassword === "" ||
      config.viewerPassword === "" ||
      config.traderPassword === ""
    ) {
      errors.push(
        "AUTH_ENABLED=true requires non-empty ADMIN_PASSWORD, VIEWER_PASSWORD, and TRADER_PASSWORD"
      );
    }
  }

  if (config.appEntryMode === "live" && !isKiwoomConnectionConfigured(config)) {
    errors.push(
      "APP_ENTRY_MODE=live but live connection not configured: set KIWOOM_ACCOUNT_NO, KIWOOM_API_KEY, and KIWOOM_API_SECRET"
    );
  }

  return { ok: errors.length === 0, errors };
}
