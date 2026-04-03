import type { PositionIntent } from "./types.js";

/**
 * Placeholder for risk checks before execution (skeleton).
 */
export function allowIntent(intent: PositionIntent): boolean {
  return intent.qty !== 0;
}
