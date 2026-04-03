import type { KiwoomSymbol, MarketQuote } from "./types.js";

/**
 * Market data source (Kiwoom API or mock for paper-loop validation).
 */
export interface MarketDataAdapter {
  listSymbols(): Promise<readonly KiwoomSymbol[]>;
  getQuotes(
    symbols: readonly KiwoomSymbol[]
  ): Promise<ReadonlyMap<KiwoomSymbol, MarketQuote>>;
}
