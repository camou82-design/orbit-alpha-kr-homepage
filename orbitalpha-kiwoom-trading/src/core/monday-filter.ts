import type { MarketSessionPhase } from "../kiwoom/market-hours.js";
import { minutesSinceRegularSessionOpen } from "../kiwoom/market-hours.js";
import type { WeekendRiskSnapshot } from "./types.js";

export interface MondayClockInput {
  now: Date;
  effectiveSessionPhase: MarketSessionPhase;
  /** True when FORCE_SESSION_PHASE is set. */
  forcedSessionPhase: boolean;
  /** Dev: 0–6 override for weekday (1 = Monday). */
  devSimulateWeekday: number | null;
  /** Dev: minutes after 09:00 regular open. */
  devSimulateMinutesAfterOpen: number | null;
}

export interface WeekendRiskEvaluateConfig {
  weekendRiskBlockThreshold: number;
  weekendRiskPenaltyThreshold: number;
}

export interface WeekendRiskEvalResult {
  riskCount: number;
  shouldBlock: boolean;
  shouldPenalize: boolean;
  reasons: string[];
}

function weekday(input: MondayClockInput): number {
  if (
    input.devSimulateWeekday !== null &&
    input.devSimulateWeekday >= 0 &&
    input.devSimulateWeekday <= 6
  ) {
    return input.devSimulateWeekday;
  }
  return input.now.getDay();
}

function resolveMinutesAfterOpen(input: MondayClockInput): number | null {
  if (
    input.devSimulateMinutesAfterOpen !== null &&
    Number.isFinite(input.devSimulateMinutesAfterOpen)
  ) {
    return Math.max(0, input.devSimulateMinutesAfterOpen);
  }
  let m = minutesSinceRegularSessionOpen(input.now);
  if (
    m === null &&
    input.forcedSessionPhase &&
    input.effectiveSessionPhase === "REGULAR"
  ) {
    m = 0;
  }
  return m;
}

/**
 * Monday + REGULAR + within first `openBlockMinutes` after 09:00 (mock-friendly when session forced).
 */
export function isMondayRegularOpenWindow(
  input: MondayClockInput,
  openBlockMinutes: number
): boolean {
  if (input.effectiveSessionPhase !== "REGULAR") return false;
  if (weekday(input) !== 1) return false;
  const mins = resolveMinutesAfterOpen(input);
  if (mins === null) return false;
  return mins >= 0 && mins < openBlockMinutes;
}

/**
 * Monday + REGULAR + any time inside the cash session (for weekend-risk block/penalty).
 */
export function isMondayRegularSessionWindow(input: MondayClockInput): boolean {
  if (input.effectiveSessionPhase !== "REGULAR") return false;
  if (weekday(input) !== 1) return false;
  const mins = resolveMinutesAfterOpen(input);
  return mins !== null && mins >= 0;
}

/**
 * Monday + REGULAR + first `openBlockMinutes` — stricter gap limit applies here only.
 */
export function isMondayEarlyGapWindow(
  input: MondayClockInput,
  openBlockMinutes: number
): boolean {
  return isMondayRegularOpenWindow(input, openBlockMinutes);
}

export function evaluateWeekendRisk(
  snapshot: WeekendRiskSnapshot,
  thresholds: WeekendRiskEvaluateConfig
): WeekendRiskEvalResult {
  const reasons: string[] = [];
  let riskCount = 0;

  if (snapshot.usRiskOff) {
    riskCount += 1;
    reasons.push("us_risk_off");
  }
  if (snapshot.usdkrwShock) {
    riskCount += 1;
    reasons.push("usdkrw_shock");
  }
  if (snapshot.oilShock) {
    riskCount += 1;
    reasons.push("oil_shock");
  }
  if (snapshot.sectorBadNews) {
    riskCount += 1;
    reasons.push("sector_bad_news");
  }

  return {
    riskCount,
    shouldBlock: riskCount >= thresholds.weekendRiskBlockThreshold,
    shouldPenalize: riskCount >= thresholds.weekendRiskPenaltyThreshold,
    reasons,
  };
}
