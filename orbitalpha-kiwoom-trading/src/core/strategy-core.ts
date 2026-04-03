import type { SignalSnapshot } from "./types.js";

/**
 * Placeholder for future strategy orchestration (Kiwoom-agnostic).
 */
export interface StrategyCore {
  onTick?(snapshot: SignalSnapshot): void;
}
