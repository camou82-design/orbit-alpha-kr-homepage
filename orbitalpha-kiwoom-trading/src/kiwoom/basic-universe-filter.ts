import type { UniverseFilter, UniverseFilterContext } from "./universe.js";
import type { KiwoomSymbol } from "./types.js";

export interface BasicUniverseFilterOptions {
  /** Minimum KRW turnover (mock uses static intraday-style turnover). */
  minTurnoverKrw: number;
  excludeEtfOrEtn: boolean;
  /** Drop HALTED / LIMIT when true. */
  excludeNonNormalStatus: boolean;
}

/**
 * First concrete filter: liquidity + optional ETF/ETN + trading status hooks.
 */
export class BasicUniverseFilter implements UniverseFilter {
  constructor(private readonly opts: BasicUniverseFilterOptions) {}

  async filter(
    candidates: readonly KiwoomSymbol[],
    ctx: UniverseFilterContext
  ): Promise<KiwoomSymbol[]> {
    const out: KiwoomSymbol[] = [];
    for (const sym of candidates) {
      const q = ctx.quotesBySymbol.get(sym);
      if (!q) continue;
      if (this.opts.excludeEtfOrEtn && q.isEtfOrEtn) continue;
      if (this.opts.excludeNonNormalStatus && q.status !== "NORMAL") continue;
      if (q.turnover < this.opts.minTurnoverKrw) continue;
      out.push(sym);
    }
    return out;
  }
}
