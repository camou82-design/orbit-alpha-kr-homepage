/**
 * Minimal fill prices from last — not a real exchange matcher.
 */
export class SimpleFillSimulator {
  constructor(private readonly slippagePct: number = 0.02) {}

  /** Buy: pay slightly above mark. */
  fillBuyAtMark(lastPrice: number): number {
    return lastPrice * (1 + this.slippagePct / 100);
  }

  /** Sell: receive slightly below mark. */
  fillSellAtMark(lastPrice: number): number {
    return lastPrice * (1 - this.slippagePct / 100);
  }
}
