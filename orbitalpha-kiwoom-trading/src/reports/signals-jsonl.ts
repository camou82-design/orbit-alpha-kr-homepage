import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MarketSessionPhase } from "../kiwoom/market-hours.js";

export interface SignalRecord {
  timestamp: string;
  sessionPhase: MarketSessionPhase;
  symbol: string;
  price: number;
  turnover: number;
  score: number;
  reason: string;
  candidate: boolean;
  /** Resolved upper limit (KRW), if computable. */
  upperLimitPrice?: number | null;
  /** ((upperLimit - price) / price) * 100 */
  upperLimitHeadroomPct?: number | null;
}

export function getSignalsJsonlPath(
  signalsDir: string,
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
  return join(signalsDir, `${y}-${m}-${d}${suffix}.jsonl`);
}

export async function appendSignalJsonlRecords(
  filePath: string,
  records: readonly SignalRecord[]
): Promise<void> {
  if (records.length === 0) return;
  await mkdir(dirname(filePath), { recursive: true });
  const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await appendFile(filePath, lines, "utf8");
}
