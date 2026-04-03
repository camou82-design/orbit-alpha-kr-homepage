import { clockNow } from "../infra/clock.js";

/** Regular KOSPI/KOSDAQ cash session (simplified; holidays not applied in skeleton). */
const SESSION_OPEN = { h: 9, m: 0 };
const SESSION_CLOSE = { h: 15, m: 30 };

/**
 * Minutes elapsed since regular session open (09:00), or null if outside regular hours / weekend.
 */
export function minutesSinceRegularSessionOpen(when: Date = clockNow()): number | null {
  const day = when.getDay();
  if (day === 0 || day === 6) return null;

  const mins = toMinutes(when.getHours(), when.getMinutes());
  const openM = toMinutes(SESSION_OPEN.h, SESSION_OPEN.m);
  const closeM = toMinutes(SESSION_CLOSE.h, SESSION_CLOSE.m);

  if (mins < openM || mins > closeM) return null;
  return mins - openM;
}

export type MarketSessionPhase =
  | "CLOSED"
  | "PRE_OPEN"
  | "REGULAR"
  | "AFTER_HOURS";

function toMinutes(h: number, m: number): number {
  return h * 60 + m;
}

/**
 * Returns true if `when` falls inside the regular cash session (local TZ, default Asia/Seoul via process).
 */
export function isRegularSessionOpen(when: Date = clockNow()): boolean {
  const phase = getMarketSessionPhase(when);
  return phase === "REGULAR";
}

export function getMarketSessionPhase(when: Date = clockNow()): MarketSessionPhase {
  const day = when.getDay();
  if (day === 0 || day === 6) return "CLOSED";

  const mins = toMinutes(when.getHours(), when.getMinutes());
  const openM = toMinutes(SESSION_OPEN.h, SESSION_OPEN.m);
  const closeM = toMinutes(SESSION_CLOSE.h, SESSION_CLOSE.m);

  if (mins < openM - 30) return "CLOSED";
  if (mins < openM) return "PRE_OPEN";
  if (mins <= closeM) return "REGULAR";
  return "AFTER_HOURS";
}

/** Maps env aliases to canonical phase. Invalid token → null. */
export function parseForceSessionPhase(raw: string | undefined): MarketSessionPhase | null {
  if (raw === undefined || raw === "") return null;
  const t = raw.trim().toUpperCase();
  const map: Record<string, MarketSessionPhase> = {
    CLOSED: "CLOSED",
    PRE_OPEN: "PRE_OPEN",
    PREMARKET: "PRE_OPEN",
    REGULAR: "REGULAR",
    AFTER_HOURS: "AFTER_HOURS",
  };
  return map[t] ?? null;
}

/**
 * Paper/mock: optional forced phase (e.g. REGULAR at night). Clock still used for timestamps.
 */
export function getEffectiveMarketSessionPhase(
  when: Date,
  forced: MarketSessionPhase | null
): { effectiveSessionPhase: MarketSessionPhase; forcedSessionPhase: boolean } {
  if (forced !== null) {
    return { effectiveSessionPhase: forced, forcedSessionPhase: true };
  }
  return {
    effectiveSessionPhase: getMarketSessionPhase(when),
    forcedSessionPhase: false,
  };
}
