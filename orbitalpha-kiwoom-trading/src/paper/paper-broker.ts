import type { PaperCloseReason, PaperPosition } from "../core/types.js";

export interface OpenPaperPositionParams {
  symbol: string;
  quantity: number;
  entryPrice: number;
  entryTimeIso: string;
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
      entryTickIndex: params.entryTickIndex,
      highestPrice: Math.max(params.entryPrice, params.entryPrice),
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
