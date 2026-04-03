/** In-memory live risk state (no DB). Reset on process restart. */
export interface LiveGuardState {
  dailyLossKrw: number;
  openPositionsCount: number;
}

/** Dry-run only: would-be order (no broker). */
export interface LiveDryRunIntent {
  symbol: string;
  side: "BUY" | "SELL";
  notionalKrw: number;
}

export interface LiveGuardResult {
  allowed: boolean;
  reasons: string[];
}
