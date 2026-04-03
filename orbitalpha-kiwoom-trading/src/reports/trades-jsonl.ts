import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * One closed paper trade line. Older JSONL may omit cost fields; parsers should default.
 */
export interface TradeRecord {
  openedAt: string;
  closedAt: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  quantity?: number;
  /** Final net return on entry notional, % (fees/tax when recorded). */
  pnlPct: number;
  /** Same as finalNetPnlKrw (legacy alias). */
  pnlKrw: number;
  grossPnlKrw?: number;
  feeBuyKrw?: number;
  feeSellKrw?: number;
  taxSellKrw?: number;
  netPnlAfterFeeKrw?: number;
  finalNetPnlKrw?: number;
  closeReason: string;
  experimentTag: string | null;
}

export function getTradesJsonlPath(
  tradesDir: string,
  when: Date,
  experimentTag?: string | null
): string {
  const y = when.getFullYear();
  const m = String(when.getMonth() + 1).padStart(2, "0");
  const d = String(when.getDate()).padStart(2, "0");
  const suffix =
    experimentTag !== undefined && experimentTag !== null && experimentTag.length > 0
      ? `-${experimentTag}`
      : "";
  return join(tradesDir, `${y}-${m}-${d}${suffix}.jsonl`);
}

export async function appendTradeJsonlRecord(
  filePath: string,
  record: TradeRecord
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(record) + "\n", "utf8");
}
