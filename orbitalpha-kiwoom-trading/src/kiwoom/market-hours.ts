import { clockNow } from "../infra/clock.js";

/** KRX cash session rules are interpreted in this zone (not process local TZ). */
const KRX_TIMEZONE = "Asia/Seoul";

/** Regular KOSPI/KOSDAQ cash session (simplified; holidays not applied in skeleton). */
const SESSION_OPEN = { h: 9, m: 0 };
const SESSION_CLOSE = { h: 15, m: 30 };

const WD_SHORT_EN: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getSeoulWallClockParts(when: Date): {
  weekday: number;
  hour: number;
  minute: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: KRX_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(when);
  const m: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const p of parts) {
    if (p.type !== "literal") m[p.type] = p.value;
  }
  const wd = m.weekday;
  const weekday =
    wd !== undefined && WD_SHORT_EN[wd] !== undefined ? WD_SHORT_EN[wd]! : 0;
  const hour = parseInt(m.hour ?? "0", 10);
  const minute = parseInt(m.minute ?? "0", 10);
  return { weekday, hour, minute };
}

/** Seoul wall clock for logs / monitor-status (weekday: 0=Sun … 6=Sat, same as Date#getDay). */
export function seoulWallClockForLog(when: Date = clockNow()): {
  timeZone: typeof KRX_TIMEZONE;
  seoulWeekday: number;
  seoulHm: string;
} {
  const { weekday, hour, minute } = getSeoulWallClockParts(when);
  return {
    timeZone: KRX_TIMEZONE,
    seoulWeekday: weekday,
    seoulHm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/**
 * Minutes elapsed since regular session open (09:00 KST), or null if outside regular hours / weekend.
 */
export function minutesSinceRegularSessionOpen(when: Date = clockNow()): number | null {
  const { weekday, hour, minute } = getSeoulWallClockParts(when);
  if (weekday === 0 || weekday === 6) return null;

  const mins = toMinutes(hour, minute);
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
 * Returns true if `when` falls inside the regular cash session in Korea (Asia/Seoul wall clock).
 */
export function isRegularSessionOpen(when: Date = clockNow()): boolean {
  const phase = getMarketSessionPhase(when);
  return phase === "REGULAR";
}

export function getMarketSessionPhase(when: Date = clockNow()): MarketSessionPhase {
  const { weekday, hour, minute } = getSeoulWallClockParts(when);
  if (weekday === 0 || weekday === 6) return "CLOSED";

  const mins = toMinutes(hour, minute);
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
