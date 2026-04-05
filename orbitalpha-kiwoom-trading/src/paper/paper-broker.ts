import type { PaperCloseReason, PaperPosition } from "../core/types.js";

export interface OpenPaperPositionParams {
  symbol: string;
  quantity: number;
  entryPrice: number;
  entryTimeIso: string;
  candidateAtIso: string;
  entryReasonCode: string;
  entryTickIndex: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
}

export interface ClosedPaperTrade {
  position: PaperPosition;
  exitPrice: number;
  closeReason: PaperCloseReason;
}

/**
 * In-memory paper broker — no external orders.
 */
export class PaperBroker {
  private readonly bySymbol = new Map<string, PaperPosition>();
  private nextId = 1;

  listOpenPositions(): PaperPosition[] {
    return [...this.bySymbol.values()];
  }

  hasOpen(symbol: string): boolean {
    return this.bySymbol.has(symbol);
  }

  openPosition(params: OpenPaperPositionParams): PaperPosition {
    if (this.bySymbol.has(params.symbol)) {
      throw new Error(`already open: ${params.symbol}`);
    }
    const id = `paper-${this.nextId++}`;
    const pos: PaperPosition = {
      id,
      symbol: params.symbol,
      quantity: params.quantity,
      entryPrice: params.entryPrice,
      entryTime: params.entryTimeIso,
      candidateAt: params.candidateAtIso,
      enteredAt: params.entryTimeIso,
      entryReasonCode: params.entryReasonCode,
      entryTickIndex: params.entryTickIndex,
      highestPrice: params.entryPrice,
      highestPricePct: 0,
      lowestPrice: params.entryPrice,
      lowestPricePct: 0,
      stopLossPct: params.stopLossPct,
      takeProfitPct: params.takeProfitPct,
      trailingStopPct: params.trailingStopPct,
      status: "open",
    };
    this.bySymbol.set(params.symbol, pos);
    return pos;
  }

  markToMarket(symbol: string, lastPrice: number): void {
    const p = this.bySymbol.get(symbol);
    if (!p || p.status !== "open") return;
    if (lastPrice > p.highestPrice) {
      p.highestPrice = lastPrice;
      p.highestPricePct = ((lastPrice - p.entryPrice) / p.entryPrice) * 100;
    }
    if (lastPrice < p.lowestPrice) {
      p.lowestPrice = lastPrice;
      p.lowestPricePct = ((lastPrice - p.entryPrice) / p.entryPrice) * 100;
    }
  }

  closePosition(symbol: string, exitPrice: number, reason: PaperCloseReason): ClosedPaperTrade | null {
    const p = this.bySymbol.get(symbol);
    if (!p || p.status !== "open") return null;
    const closed: PaperPosition = { ...p, status: "closed" };
    this.bySymbol.delete(symbol);
    return { position: closed, exitPrice, closeReason: reason };
  }

  openCount(): number {
    return this.bySymbol.size;
  }
}
