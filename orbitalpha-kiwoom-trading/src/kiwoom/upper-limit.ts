import type { MarketQuote } from "./types.js";

/**
 * Mock default: KOSPI/KOSDAQ cash 일일 가격제한 상단을 전일 종가 대비 +30%로 근사(실제는 종목·시장별 상이).
 * 실서비스에서는 HTS/API가 주는 `upperLimitPrice`를 그대로 쓰는 것을 권장.
 */
export const MOCK_DAILY_UPPER_LIMIT_RATIO = 0.3;

/**
 * `upperLimitPrice`가 있으면 사용, 없으면 `prevClose * (1 + MOCK_DAILY_UPPER_LIMIT_RATIO)`로 근사.
 */
export function resolveUpperLimitPrice(q: MarketQuote): number | null {
  if (q.upperLimitPrice != null && q.upperLimitPrice > 0) {
    return q.upperLimitPrice;
  }
  if (q.prevClose > 0) {
    return q.prevClose * (1 + MOCK_DAILY_UPPER_LIMIT_RATIO);
  }
  return null;
}

/**
 * ((upperLimit - 현재가) / 현재가) * 100
 */
export function distanceToUpperLimitPct(
  currentPrice: number,
  upperLimitPrice: number
): number | null {
  if (currentPrice <= 0 || upperLimitPrice <= 0) return null;
  return ((upperLimitPrice - currentPrice) / currentPrice) * 100;
}
