import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TradeRecord } from "./trades-jsonl.js";
import { getTradesJsonlPath } from "./trades-jsonl.js";

export interface TradeSummaryStats {
  date: string;
  sourcePath: string;

  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;

  /** Sum of gross PnL (before fees/tax) when present. */
  grossPnlKrw: number;
  /** Sum of final net PnL (Korean costs applied when enabled). */
  totalFinalNetPnlKrw: number;
  totalFeesKrw: number;
  totalTaxKrw: number;
  avgPnlKrw: number | null;
  avgPnlPct: number | null;

  byCloseReason: Record<string, number>;
  bySymbol: Record<string, number>;

  topWinSymbol: string | null;
  topLossSymbol: string | null;
}

export type TradeWarningCode =
  | "no_trades"
  | "low_win_rate"
  | "excessive_stop_loss"
  | "weak_follow_through"
  | "symbol_trade_skew";

export interface TradeWarning {
  code: TradeWarningCode;
  message: string;
}

const LOW_WIN_RATE = 0.4;
const EXCESSIVE_STOP_LOSS_RATIO = 0.5;
const WEAK_FOLLOW_THROUGH_RATIO = 0.4;
const SYMBOL_TRADE_SKEW_SHARE = 0.5;
const MIN_TRADES_FOR_SKEW = 5;

export function rowFinalNetKrw(row: TradeRecord): number {
  return row.finalNetPnlKrw ?? row.pnlKrw;
}

export function rowGrossPnlKrw(row: TradeRecord): number {
  if (row.grossPnlKrw != null) return row.grossPnlKrw;
  if (row.quantity != null && row.entryPrice > 0) {
    return (row.exitPrice - row.entryPrice) * row.quantity;
  }
  return row.pnlKrw;
}

export function rowFeesKrw(row: TradeRecord): number {
  return (row.feeBuyKrw ?? 0) + (row.feeSellKrw ?? 0);
}

export function rowTaxKrw(row: TradeRecord): number {
  return row.taxSellKrw ?? 0;
}

export function parseTradeJsonlContent(content: string): TradeRecord[] {
  const out: TradeRecord[] = [];
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const row = JSON.parse(t) as TradeRecord;
      if (
        typeof row.symbol === "string" &&
        typeof row.entryPrice === "number" &&
        typeof row.exitPrice === "number" &&
        typeof row.pnlPct === "number" &&
        typeof row.pnlKrw === "number" &&
        typeof row.closeReason === "string" &&
        typeof row.openedAt === "string" &&
        typeof row.closedAt === "string"
      ) {
        out.push(row);
      }
    } catch {
      // skip
    }
  }
  return out;
}

export async function readTradeJsonlFile(filePath: string): Promise<TradeRecord[]> {
  const content = await readFile(filePath, "utf8");
  return parseTradeJsonlContent(content);
}

export function summarizeTrades(
  records: TradeRecord[],
  date: string,
  sourcePath: string
): TradeSummaryStats {
  const byCloseReason: Record<string, number> = {};
  const bySymbol: Record<string, number> = {};
  const winBySymbol: Record<string, number> = {};
  const lossBySymbol: Record<string, number> = {};

  let winTrades = 0;
  let lossTrades = 0;
  let grossPnlKrw = 0;
  let totalFinalNetPnlKrw = 0;
  let totalFeesKrw = 0;
  let totalTaxKrw = 0;
  let pnlPctSum = 0;

  for (const r of records) {
    byCloseReason[r.closeReason] = (byCloseReason[r.closeReason] ?? 0) + 1;
    bySymbol[r.symbol] = (bySymbol[r.symbol] ?? 0) + 1;
    const fn = rowFinalNetKrw(r);
    const gross = rowGrossPnlKrw(r);
    grossPnlKrw += gross;
    totalFinalNetPnlKrw += fn;
    totalFeesKrw += rowFeesKrw(r);
    totalTaxKrw += rowTaxKrw(r);
    pnlPctSum += r.pnlPct;

    if (fn > 0) {
      winTrades += 1;
      winBySymbol[r.symbol] = (winBySymbol[r.symbol] ?? 0) + 1;
    } else if (fn < 0) {
      lossTrades += 1;
      lossBySymbol[r.symbol] = (lossBySymbol[r.symbol] ?? 0) + 1;
    }
  }

  const totalTrades = records.length;
  const winRate = totalTrades > 0 ? winTrades / totalTrades : 0;
  const avgPnlKrw = totalTrades > 0 ? totalFinalNetPnlKrw / totalTrades : null;
  const avgPnlPct = totalTrades > 0 ? pnlPctSum / totalTrades : null;

  const topWinSymbol =
    Object.entries(winBySymbol).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topLossSymbol =
    Object.entries(lossBySymbol).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    date,
    sourcePath,
    totalTrades,
    winTrades,
    lossTrades,
    winRate,
    grossPnlKrw,
    totalFinalNetPnlKrw,
    totalFeesKrw,
    totalTaxKrw,
    avgPnlKrw,
    avgPnlPct,
    byCloseReason,
    bySymbol,
    topWinSymbol,
    topLossSymbol,
  };
}

export function evaluateTradeWarnings(
  stats: TradeSummaryStats
): TradeWarning[] {
  const w: TradeWarning[] = [];

  if (stats.totalTrades === 0) {
    return [
      {
        code: "no_trades",
        message: "no trades in this day/tag (trade-summary skipped quality checks)",
      },
    ];
  }

  if (stats.winRate < LOW_WIN_RATE) {
    w.push({
      code: "low_win_rate",
      message: `winRate ${(stats.winRate * 100).toFixed(1)}% < ${(LOW_WIN_RATE * 100).toFixed(
        0
      )}% (low_win_rate)`,
    });
  }

  const stopLoss = stats.byCloseReason["stop_loss"] ?? 0;
  const stopLossRatio = stopLoss / stats.totalTrades;
  if (stopLossRatio >= EXCESSIVE_STOP_LOSS_RATIO) {
    w.push({
      code: "excessive_stop_loss",
      message: `stop_loss ratio ${(stopLossRatio * 100).toFixed(1)}% >= ${(EXCESSIVE_STOP_LOSS_RATIO * 100).toFixed(
        0
      )}% (excessive_stop_loss)`,
    });
  }

  const maxHold = stats.byCloseReason["max_hold_ticks"] ?? 0;
  const maxHoldRatio = maxHold / stats.totalTrades;
  if (maxHoldRatio >= WEAK_FOLLOW_THROUGH_RATIO) {
    w.push({
      code: "weak_follow_through",
      message: `max_hold_ticks ratio ${(maxHoldRatio * 100).toFixed(1)}% >= ${(WEAK_FOLLOW_THROUGH_RATIO * 100).toFixed(
        0
      )}% (weak_follow_through)`,
    });
  }

  const symCounts = Object.entries(stats.bySymbol);
  if (stats.totalTrades >= MIN_TRADES_FOR_SKEW && symCounts.length > 0) {
    const topShare = symCounts.reduce((acc, [, n]) => Math.max(acc, n / stats.totalTrades), 0);
    if (topShare >= SYMBOL_TRADE_SKEW_SHARE) {
      w.push({
        code: "symbol_trade_skew",
        message: `top symbol share ${(topShare * 100).toFixed(1)}% >= ${(SYMBOL_TRADE_SKEW_SHARE * 100).toFixed(
          0
        )}% (symbol_trade_skew)`,
      });
    }
  }

  return w;
}

export interface TradeSummaryReport {
  stats: TradeSummaryStats;
  warnings: TradeWarning[];
  generatedAt: string;
}

export function buildTradeSummaryReport(
  records: TradeRecord[],
  date: string,
  sourcePath: string
): TradeSummaryReport {
  const stats = summarizeTrades(records, date, sourcePath);
  const warnings = evaluateTradeWarnings(stats);
  return { stats, warnings, generatedAt: new Date().toISOString() };
}

export function getDefaultTradeSummaryJsonPath(
  reportsDir: string,
  date: string,
  experimentTag?: string | null
): string {
  const suffix =
    experimentTag !== undefined && experimentTag !== null && experimentTag.length > 0
      ? `-${experimentTag}`
      : "";
  return join(reportsDir, `trade-summary-${date}${suffix}.json`);
}

export async function saveTradeSummaryJson(
  filePath: string,
  report: TradeSummaryReport
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(report, null, 2), "utf8");
}

export function formatTradeSummaryConsole(
  report: TradeSummaryReport,
  topN: number = 5
): string {
  const { stats, warnings, generatedAt } = report;
  const lines: string[] = [];

  lines.push("══════════════════════════════════════════════════════════════");
  lines.push(`  Trade summary  ·  ${stats.date}`);
  lines.push("══════════════════════════════════════════════════════════════");
  lines.push(`  Source     : ${stats.sourcePath}`);
  lines.push(`  Generated  : ${generatedAt}`);
  lines.push("");
  lines.push("  ── Volume ──");
  lines.push(`  Total trades   : ${stats.totalTrades}`);
  lines.push(`  Wins / Losses  : ${stats.winTrades} / ${stats.lossTrades}`);
  lines.push(`  Win rate        : ${(stats.winRate * 100).toFixed(2)}%`);
  lines.push("");
  lines.push("  ── PnL ──");
  lines.push(`  Gross PnL (KRW)      : ${stats.grossPnlKrw}`);
  lines.push(`  Final net PnL (KRW)  : ${stats.totalFinalNetPnlKrw}`);
  lines.push(`  Total fees (KRW)     : ${stats.totalFeesKrw}`);
  lines.push(`  Total sell tax (KRW) : ${stats.totalTaxKrw}`);
  lines.push(
    `  Avg PnL (KRW, final) : ${stats.avgPnlKrw !== null ? stats.avgPnlKrw.toFixed(2) : "—"}`
  );
  lines.push(
    `  Avg PnL (%)     : ${stats.avgPnlPct !== null ? stats.avgPnlPct.toFixed(4) : "—"}`
  );
  lines.push("");
  lines.push("  ── Close reason ──");
  const reasons = Object.entries(stats.byCloseReason).sort((a, b) => b[1] - a[1]);
  if (reasons.length === 0) {
    lines.push("    (none)");
  } else {
    for (const [reason, n] of reasons) {
      lines.push(`    ${reason.padEnd(16)} ${n}`);
    }
  }
  lines.push("");
  lines.push(`  ── Symbols (top by trade count, top ${topN}) ──`);
  const topSyms = Object.entries(stats.bySymbol)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
  if (topSyms.length === 0) {
    lines.push("    (none)");
  } else {
    for (const [sym, n] of topSyms) {
      lines.push(`    ${sym.padEnd(10)} ${n} trades`);
    }
  }
  lines.push("");
  lines.push(`  Top win symbol  : ${stats.topWinSymbol ?? "—"}`);
  lines.push(`  Top loss symbol : ${stats.topLossSymbol ?? "—"}`);
  lines.push("");

  lines.push(warnings.length === 0 ? "  Warnings: none" : "  Warnings");
  for (const w of warnings) {
    lines.push(`    [${w.code}] ${w.message}`);
  }

  lines.push("══════════════════════════════════════════════════════════════");
  return lines.join("\n");
}

