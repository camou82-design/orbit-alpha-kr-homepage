import type { MarketQuote } from "./types.js";

/** Resolved OHLC-style snapshot for intraday filters (missing fields synthesized safely). */
export interface ResolvedQuoteOhlc {
  prevClose: number;
  currentPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
}

/**
 * Build a consistent high/low/open from quote; used when mock/live omits some fields.
 */
export function resolveQuoteOhlc(q: MarketQuote): ResolvedQuoteOhlc | null {
  const current = q.lastPrice;
  const prev = q.prevClose;
  if (!Number.isFinite(prev) || prev <= 0 || !Number.isFinite(current) || current <= 0) {
    return null;
  }

  const open = q.openPrice ?? current;
  const rawHigh = q.highPrice ?? Math.max(open, current);
  const rawLow = q.lowPrice ?? Math.min(open, current);
  const highPrice = Math.max(rawHigh, rawLow, current, open);
  const lowPrice = Math.min(rawHigh, rawLow, current, open);
  return {
    prevClose: prev,
    currentPrice: current,
    openPrice: open,
    highPrice,
    lowPrice,
  };
}

/**
 * ((current - prevClose) / prevClose) * 100
 */
export function changeFromPrevClosePct(prevClose: number, currentPrice: number): number | null {
  if (!Number.isFinite(prevClose) || prevClose <= 0) return null;
  if (!Number.isFinite(currentPrice)) return null;
  return ((currentPrice - prevClose) / prevClose) * 100;
}

/**
 * Share of the session range above current (upper wick), percent points.
 * If high <= low, returns 0 (no range).
 */
export function upperWickRatioPct(
  highPrice: number,
  lowPrice: number,
  currentPrice: number
): number {
  if (!Number.isFinite(highPrice) || !Number.isFinite(lowPrice) || !Number.isFinite(currentPrice)) {
    return 0;
  }
  if (highPrice <= lowPrice) return 0;
  const range = highPrice - lowPrice;
  if (range <= 0) return 0;
  const ratio = ((highPrice - currentPrice) / range) * 100;
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(100, ratio));
}
