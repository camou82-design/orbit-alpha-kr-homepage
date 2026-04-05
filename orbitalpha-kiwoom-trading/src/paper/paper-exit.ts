import type { PaperCloseReason, PaperPosition } from "../core/types.js";

export function evaluatePaperExit(
  pos: PaperPosition,
  lastPrice: number,
  currentTickIndex: number,
  maxHoldTicks: number
): PaperCloseReason | null {
  // TODO: Add support for partial_take_profit (e.g. exiting 50% at 1.5% profit)
  // Current implementation is all-or-nothing for safety during pre-execution phase.
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
