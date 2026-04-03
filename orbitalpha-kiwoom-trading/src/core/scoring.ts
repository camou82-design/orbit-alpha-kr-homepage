import type { ScoringInput } from "./types.js";

export interface ScoreResult {
  score: number;
  /** Short human-readable breakdown for logs / JSONL. */
  reason: string;
}

/**
 * Minimal heuristic: liquidity (log turnover) + same-day price change vs prev close.
 * Goal is a working evaluation path, not production alpha.
 */
export function evaluateScore(input: ScoringInput): ScoreResult {
  if (!input.isTradable || input.prevClose <= 0) {
    return { score: 0, reason: "not_tradable_or_bad_ref" };
  }

  const changePct = (input.price - input.prevClose) / input.prevClose;
  const turnoverScore = Math.min(
    100,
    (Math.log10(1 + Math.max(0, input.turnover)) / 14) * 100
  );
  const momentumScore = 50 + Math.max(-30, Math.min(30, changePct * 200));
  const raw = turnoverScore * 0.55 + momentumScore * 0.45;
  const score = Math.round(Math.max(0, Math.min(100, raw)));

  const reason = [
    `turnoverScore:${turnoverScore.toFixed(1)}`,
    `chg:${(changePct * 100).toFixed(2)}%`,
    `mom:${momentumScore.toFixed(1)}`,
  ].join(" ");

  return { score, reason };
}
