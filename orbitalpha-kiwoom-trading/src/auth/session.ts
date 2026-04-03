import type { AppConfig } from "../infra/config.js";
import type { UserRole } from "./types.js";

export interface UserSession {
  username: string;
  role: UserRole;
  createdAt: string;
  /** Second-step ack for live (dry-run) when LIVE_CONFIRMATION_REQUIRED. */
  liveConfirmed: boolean;
}

let activeSession: UserSession | null = null;

export function createSession(
  username: string,
  role: UserRole,
  liveConfirmed = false
): UserSession {
  const s: UserSession = {
    username,
    role,
    createdAt: new Date().toISOString(),
    liveConfirmed,
  };
  activeSession = s;
  return s;
}

export function getSession(): UserSession | null {
  return activeSession;
}

export function validateSession(): UserSession | null {
  return activeSession;
}

export function confirmLiveTrading(): void {
  if (activeSession) {
    activeSession = { ...activeSession, liveConfirmed: true };
  }
}

export function clearSession(): void {
  activeSession = null;
}

/** When AUTH_ENABLED=false — dev session for dashboard / mode routing. */
export function createBypassSession(config: AppConfig): UserSession {
  return createSession("dev", config.authBypassRole, false);
}
