import type { KiwoomAccountRef } from "./types.js";

/**
 * Placeholder for account / balance queries (future Kiwoom layer).
 */
export function describeAccount(ref: KiwoomAccountRef): string {
  return `account:${ref.accountNo}`;
}
