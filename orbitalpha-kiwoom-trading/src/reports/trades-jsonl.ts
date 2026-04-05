import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * One closed paper trade line. Older JSONL may omit cost fields; parsers should default.
 */
export interface TradeRecord {
  /** ISO timestamp - when first identified as candidate */
  candidate_at: string;
  /** ISO timestamp - when actual fill occurred */
  entered_at: string;
  /** ISO timestamp - when position closed */
  exited_at: string;
  /** Legacy fields (mapping to entered_at/exited_at) for compatibility */
  openedAt: string;
  closedAt: string;

  symbol: string;
  entryPrice: number;
  exitPrice: number;
  quantity?: number;

  /** Categorized reason code (e.g. breakout_confirmed) */
  entry_reason_code: string;
  /** Categorized reason code (e.g. stop_loss) */
  exit_reason_code: string;
  /** Final net return on entry notional, % (fees/tax when recorded). */
  pnlPct: number;
  /** Same as finalNetPnlKrw (legacy alias). */
  pnlKrw: number;

  /** Maximum Favorable Excursion (%) */
  mfe_pct: number;
  /** Maximum Favorable Excursion (KRW) */
  mfe_krw: number;
  /** Maximum Adverse Excursion (%) */
  mae_pct: number;
  /** Maximum Adverse Excursion (KRW) */
  mae_krw: number;

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
