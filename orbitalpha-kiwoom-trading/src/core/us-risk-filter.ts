import type { GlobalRiskSnapshot } from "./types.js";

/** Thresholds: compare snapshot against these to count “bad” conditions. */
export interface UsRiskThresholdConfig {
  /** Trigger when nasdaqFuturesPct < this (e.g. -0.5). */
  nasdaqFuturesNegativePct: number;
  /** Trigger when usdkrwChangePct > this (e.g. 0.5). */
  usdkrwPositivePct: number;
  /** Trigger when kospi200FuturesPct < this (e.g. -0.5). */
  kospi200FuturesNegativePct: number;
}

export interface UsRiskEvaluation {
  isRiskOff: boolean;
  reasons: string[];
}

/**
 * Simple US-linked risk regime: count how many of three conditions fire.
 * If 2+ fire, isRiskOff = true (mock / offline; no external API).
 */
export function evaluateUsRisk(
  snapshot: GlobalRiskSnapshot,
  thresholds: UsRiskThresholdConfig
): UsRiskEvaluation {
  const reasons: string[] = [];

  if (snapshot.nasdaqFuturesPct < thresholds.nasdaqFuturesNegativePct) {
    reasons.push("nasdaq_futures_weak");
  }
  if (snapshot.usdkrwChangePct > thresholds.usdkrwPositivePct) {
    reasons.push("usdkrw_surge");
  }
  if (snapshot.kospi200FuturesPct < thresholds.kospi200FuturesNegativePct) {
    reasons.push("kospi200_futures_weak");
  }

  return {
    isRiskOff: reasons.length >= 2,
    reasons,
  };
}
