/**
 * Cross-cutting types for strategy judgment (exchange-agnostic skeleton).
 */

export type Symbol = string;

export interface SignalSnapshot {
  symbol: Symbol;
  /** Unix ms */
  ts: number;
  /** Opaque score payload for future scoring module */
  score?: number;
}

export interface PositionIntent {
  symbol: Symbol;
  /** Positive = long bias; negative = reduce/short intent (future use) */
  qty: number;
}

/** Inputs for venue-agnostic scoring (mapped from `MarketQuote` in the runner). */
export interface ScoringInput {
  price: number;
  prevClose: number;
  turnover: number;
  /** False if halted / limit / otherwise not tradable for scoring. */
  isTradable: boolean;
}

export type PaperPositionStatus = "open" | "closed";

/** In-memory mock position (paper trading only). */
export interface PaperPosition {
  id: string;
  symbol: Symbol;
  quantity: number;
  entryPrice: number;
  /** ISO timestamp */
  entryTime: string;
  /** ISO timestamp - when first identified as candidate */
  candidateAt: string;
  /** ISO timestamp - when actual fill occurred */
  enteredAt: string;
  /** Categorized reason code (e.g. breakout_confirmed) */
  entryReasonCode: string;
  /** Loop tick index at entry (for max hold). */
  entryTickIndex: number;
  /** Running high since entry (for trailing stop/MFE). */
  highestPrice: number;
  /** (highestPrice - entryPrice) / entryPrice * 100 */
  highestPricePct: number;
  /** Running low since entry (for MAE). */
  lowestPrice: number;
  /** (lowestPrice - entryPrice) / entryPrice * 100 */
  lowestPricePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  status: PaperPositionStatus;
}

export type PaperCloseReason =
  | "stop_loss"
  | "take_profit"
  | "max_hold_ticks"
  | "trailing_stop";

/** Mock or live snapshot of US-linked inputs (percent change style). */
export interface GlobalRiskSnapshot {
  /** Nasdaq futures (or proxy) change, % */
  nasdaqFuturesPct: number;
  /** USD/KRW change, % (positive = won weakness) */
  usdkrwChangePct: number;
  /** KOSPI200 futures (or proxy) change, % */
  kospi200FuturesPct: number;
}

/** Mock weekend headline risk flags (no NLP / API). */
export interface WeekendRiskSnapshot {
  /** Align with US risk regime when available. */
  usRiskOff: boolean;
  usdkrwShock: boolean;
  oilShock: boolean;
  sectorBadNews: boolean;
}
