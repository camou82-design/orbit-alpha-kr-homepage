import type { PaperCloseReason, PaperPosition } from "../core/types.js";

export function evaluatePaperExit(
  pos: PaperPosition,
  lastPrice: number,
  currentTickIndex: number,
  maxHoldTicks: number
): PaperCloseReason | null {
  if (lastPrice <= pos.entryPrice * (1 - pos.stopLossPct / 100)) {
    return "stop_loss";
  }
  if (lastPrice >= pos.entryPrice * (1 + pos.takeProfitPct / 100)) {
    return "take_profit";
  }
  if (currentTickIndex - pos.entryTickIndex >= maxHoldTicks) {
    return "max_hold_ticks";
  }
  if (
    pos.highestPrice > pos.entryPrice &&
    lastPrice <= pos.highestPrice * (1 - pos.trailingStopPct / 100)
  ) {
    return "trailing_stop";
  }
  return null;
}
