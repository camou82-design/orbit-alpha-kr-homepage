import type { KiwoomSymbol, MarketQuote } from "./types.js";

/**
 * Filters the tradeable universe (e.g. liquidity, ETF exclusion, halt rules).
 */
export interface UniverseFilterContext {
  quotesBySymbol: ReadonlyMap<KiwoomSymbol, MarketQuote>;
}

export interface UniverseFilter {
  filter(
    candidates: readonly KiwoomSymbol[],
    ctx: UniverseFilterContext
  ): Promise<KiwoomSymbol[]>;
}
