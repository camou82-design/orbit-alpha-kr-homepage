import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MarketSessionPhase } from "../kiwoom/market-hours.js";
import type { SignalRecord } from "./signals-jsonl.js";

export interface SignalSummaryStats {
  date: string;
  sourcePath: string;
  totalRecords: number;
  totalCandidates: number;
  candidateRatio: number;
  bySessionPhase: Record<MarketSessionPhase | string, number>;
  bySymbol: Record<string, number>;
  avgScore: number | null;
  avgCandidateScore: number | null;
  topCandidateSymbols: { symbol: string; candidateCount: number }[];
  /** candidate=true 이고 sessionPhase가 AFTER_HOURS 인 건수 */
  afterHoursCandidateCount: number;
  /** REGULAR 세션 레코드 수 */
  regularRecords: number;
  /** REGULAR 세션에서 candidate=true 건수 */
  regularCandidates: number;
  /** REGULAR 세션에서 후보 비율 */
  regularCandidateRatio: number;
  /** REGULAR 전체 평균 점수 */
  regularAvgScore: number | null;
  /** REGULAR 후보 평균 점수 */
  regularCandidateAvgScore: number | null;
  /** REGULAR 세션 기준 후보 상위 심볼 */
  regularTopCandidateSymbols: { symbol: string; candidateCount: number }[];
  topN: number;
}

export type SignalWarningCode =
  | "too_few_candidates"
  | "too_many_candidates"
  | "symbol_concentration_records"
  | "candidate_symbol_skew"
  | "after_hours_candidates"
  | "regular_no_candidates"
  | "regular_too_few_candidates"
  | "regular_too_many_candidates";

export interface SignalWarning {
  code: SignalWarningCode;
  message: string;
}

const FEW_CANDIDATE_RATIO = 0.05;
const MANY_CANDIDATE_RATIO = 0.3;
/** 단일 심볼이 전체 레코드의 이 비율 이상이면 편중으로 본다 */
const RECORD_SYMBOL_DOMINANCE = 0.6;
const MIN_RECORDS_FOR_SKEW = 5;
/** 후보 중 한 심볼이 이 비율 이상이면 후보 편중 */
const CANDIDATE_SYMBOL_DOMINANCE = 0.7;
const MIN_CANDIDATES_FOR_CANDIDATE_SKEW = 5;
const AFTER_HOURS_CANDIDATE_WARN_MIN = 3;
const AFTER_HOURS_CANDIDATE_RATIO_WARN = 0.25;

export function parseSignalJsonlContent(content: string): SignalRecord[] {
  const out: SignalRecord[] = [];
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const row = JSON.parse(t) as SignalRecord;
      if (
        typeof row.symbol === "string" &&
        typeof row.score === "number" &&
        typeof row.candidate === "boolean"
      ) {
        out.push(row);
      }
    } catch {
      // skip bad lines
    }
  }
  return out;
}

export async function readSignalJsonlFile(filePath: string): Promise<SignalRecord[]> {
  const content = await readFile(filePath, "utf8");
  return parseSignalJsonlContent(content);
}

function hhiShares(counts: number[], total: number): number {
  if (total <= 0) return 0;
  return counts.reduce((acc, c) => acc + (c / total) ** 2, 0);
}

export function summarizeSignals(
  records: SignalRecord[],
  date: string,
  sourcePath: string,
  topN: number
): SignalSummaryStats {
  const bySessionPhase: Record<string, number> = {};
  const bySymbol: Record<string, number> = {};
  const candidateCountBySymbol: Record<string, number> = {};
  let totalCandidates = 0;
  let scoreSum = 0;
  let candidateScoreSum = 0;
  let afterHoursCandidateCount = 0;
  let regularRecords = 0;
  let regularCandidates = 0;
  let regularScoreSum = 0;
  let regularCandidateScoreSum = 0;
  const regularCandidateCountBySymbol: Record<string, number> = {};

  for (const r of records) {
    bySessionPhase[r.sessionPhase] = (bySessionPhase[r.sessionPhase] ?? 0) + 1;
    bySymbol[r.symbol] = (bySymbol[r.symbol] ?? 0) + 1;
    scoreSum += r.score;
    if (r.sessionPhase === "REGULAR") {
      regularRecords += 1;
      regularScoreSum += r.score;
    }
    if (r.candidate) {
      totalCandidates += 1;
      candidateScoreSum += r.score;
      candidateCountBySymbol[r.symbol] = (candidateCountBySymbol[r.symbol] ?? 0) + 1;
      if (r.sessionPhase === "AFTER_HOURS") {
        afterHoursCandidateCount += 1;
      }
      if (r.sessionPhase === "REGULAR") {
        regularCandidates += 1;
        regularCandidateScoreSum += r.score;
        regularCandidateCountBySymbol[r.symbol] =
          (regularCandidateCountBySymbol[r.symbol] ?? 0) + 1;
      }
    }
  }

  const totalRecords = records.length;
  const candidateRatio = totalRecords > 0 ? totalCandidates / totalRecords : 0;
  const regularCandidateRatio =
    regularRecords > 0 ? regularCandidates / regularRecords : 0;

  const topCandidateSymbols = Object.entries(candidateCountBySymbol)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([symbol, candidateCount]) => ({ symbol, candidateCount }));

  const regularTopCandidateSymbols = Object.entries(regularCandidateCountBySymbol)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([symbol, candidateCount]) => ({ symbol, candidateCount }));

  return {
    date,
    sourcePath,
    totalRecords,
    totalCandidates,
    candidateRatio,
    bySessionPhase,
    bySymbol,
    avgScore: totalRecords > 0 ? scoreSum / totalRecords : null,
    avgCandidateScore: totalCandidates > 0 ? candidateScoreSum / totalCandidates : null,
    topCandidateSymbols,
    afterHoursCandidateCount,
    regularRecords,
    regularCandidates,
    regularCandidateRatio,
    regularAvgScore: regularRecords > 0 ? regularScoreSum / regularRecords : null,
    regularCandidateAvgScore:
      regularCandidates > 0 ? regularCandidateScoreSum / regularCandidates : null,
    regularTopCandidateSymbols,
    topN,
  };
}

export function evaluateSignalWarnings(
  stats: SignalSummaryStats,
  records: SignalRecord[]
): SignalWarning[] {
  const w: SignalWarning[] = [];
  const {
    totalRecords,
    totalCandidates,
    candidateRatio,
    bySymbol,
    afterHoursCandidateCount,
    regularRecords,
    regularCandidates,
    regularCandidateRatio,
  } = stats;

  if (totalRecords > 0) {
    if (candidateRatio < FEW_CANDIDATE_RATIO) {
      w.push({
        code: "too_few_candidates",
        message: `candidate ratio ${(candidateRatio * 100).toFixed(1)}% < ${FEW_CANDIDATE_RATIO * 100}% (too_few_candidates)`,
      });
    }
    if (candidateRatio > MANY_CANDIDATE_RATIO) {
      w.push({
        code: "too_many_candidates",
        message: `candidate ratio ${(candidateRatio * 100).toFixed(1)}% > ${MANY_CANDIDATE_RATIO * 100}% (too_many_candidates)`,
      });
    }
  }

  if (regularRecords > 0) {
    if (regularCandidates === 0) {
      w.push({
        code: "regular_no_candidates",
        message: "no candidates during REGULAR session (regular_no_candidates)",
      });
    } else {
      if (regularCandidateRatio < FEW_CANDIDATE_RATIO) {
        w.push({
          code: "regular_too_few_candidates",
          message: `REGULAR candidate ratio ${(regularCandidateRatio * 100).toFixed(
            1
          )}% < ${FEW_CANDIDATE_RATIO * 100}% (regular_too_few_candidates)`,
        });
      }
      if (regularCandidateRatio > MANY_CANDIDATE_RATIO) {
        w.push({
          code: "regular_too_many_candidates",
          message: `REGULAR candidate ratio ${(regularCandidateRatio * 100).toFixed(
            1
          )}% > ${MANY_CANDIDATE_RATIO * 100}% (regular_too_many_candidates)`,
        });
      }
    }
  }

  const symCounts = Object.values(bySymbol);
  const maxSymCount = symCounts.length ? Math.max(...symCounts) : 0;
  const maxShare = totalRecords > 0 ? maxSymCount / totalRecords : 0;
  const hhi =
    symCounts.length >= 2 && totalRecords >= MIN_RECORDS_FOR_SKEW
      ? hhiShares(symCounts, totalRecords)
      : 0;

  if (totalRecords >= MIN_RECORDS_FOR_SKEW) {
    if (maxShare >= RECORD_SYMBOL_DOMINANCE) {
      w.push({
        code: "symbol_concentration_records",
        message: `one symbol holds ${(maxShare * 100).toFixed(0)}% of records (>= ${RECORD_SYMBOL_DOMINANCE * 100}%)`,
      });
    } else if (hhi > 0.55) {
      w.push({
        code: "symbol_concentration_records",
        message: `symbol HHI (records) ${hhi.toFixed(2)} > 0.55 (uneven coverage)`,
      });
    }
  }

  const candBySym = new Map<string, number>();
  for (const r of records) {
    if (r.candidate) {
      candBySym.set(r.symbol, (candBySym.get(r.symbol) ?? 0) + 1);
    }
  }
  const candTotals = [...candBySym.values()];
  const candSum = candTotals.reduce((a, b) => a + b, 0);
  const maxCandShare = candSum > 0 ? Math.max(...candTotals) / candSum : 0;
  if (
    candSum >= MIN_CANDIDATES_FOR_CANDIDATE_SKEW &&
    maxCandShare >= CANDIDATE_SYMBOL_DOMINANCE
  ) {
    w.push({
      code: "candidate_symbol_skew",
      message: `one symbol holds ${(maxCandShare * 100).toFixed(0)}% of candidates (>= ${CANDIDATE_SYMBOL_DOMINANCE * 100}%)`,
    });
  }

  if (totalCandidates > 0) {
    const ahRatio = afterHoursCandidateCount / totalCandidates;
    if (
      afterHoursCandidateCount >= AFTER_HOURS_CANDIDATE_WARN_MIN ||
      ahRatio > AFTER_HOURS_CANDIDATE_RATIO_WARN
    ) {
      w.push({
        code: "after_hours_candidates",
        message: `AFTER_HOURS candidates: ${afterHoursCandidateCount} (${(ahRatio * 100).toFixed(1)}% of candidates)`,
      });
    }
  }

  return dedupeWarnings(w);
}

function dedupeWarnings(w: SignalWarning[]): SignalWarning[] {
  const seen = new Set<string>();
  return w.filter((x) => {
    if (seen.has(x.code)) return false;
    seen.add(x.code);
    return true;
  });
}

export interface SignalSummaryReport {
  stats: SignalSummaryStats;
  warnings: SignalWarning[];
  generatedAt: string;
}

export function buildSignalSummaryReport(
  records: SignalRecord[],
  date: string,
  sourcePath: string,
  topN: number
): SignalSummaryReport {
  const stats = summarizeSignals(records, date, sourcePath, topN);
  const warnings = evaluateSignalWarnings(stats, records);
  return {
    stats,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

export function getDefaultSignalJsonlPath(
  signalsDir: string,
  date: string,
  experimentTag?: string | null
): string {
  const suffix =
    experimentTag !== undefined && experimentTag !== null && experimentTag.length > 0
      ? `-${experimentTag}`
      : "";
  return join(signalsDir, `${date}${suffix}.jsonl`);
}

export function getDefaultSummaryJsonPath(
  reportsDir: string,
  date: string,
  experimentTag?: string | null
): string {
  const suffix =
    experimentTag !== undefined && experimentTag !== null && experimentTag.length > 0
      ? `-${experimentTag}`
      : "";
  return join(reportsDir, `signal-summary-${date}${suffix}.json`);
}

export async function saveSignalSummaryJson(
  filePath: string,
  report: SignalSummaryReport
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(report, null, 2), "utf8");
}

export function formatSignalSummaryConsole(report: SignalSummaryReport): string {
  const { stats, warnings, generatedAt } = report;
  const lines: string[] = [];
  lines.push("══════════════════════════════════════════════════════════════");
  lines.push(`  Signal summary  ·  ${stats.date}`);
  lines.push("══════════════════════════════════════════════════════════════");
  lines.push(`  Source     : ${stats.sourcePath}`);
  lines.push(`  Generated  : ${generatedAt}`);
  lines.push("");
  lines.push("  ── Volume ──");
  lines.push(`  Total records      : ${stats.totalRecords}`);
  lines.push(`  Total candidates   : ${stats.totalCandidates}`);
  lines.push(
    `  Candidate ratio    : ${(stats.candidateRatio * 100).toFixed(2)}%`
  );
  lines.push("");
  lines.push("  ── Scores ──");
  lines.push(
    `  Avg score (all)    : ${stats.avgScore !== null ? stats.avgScore.toFixed(2) : "—"}`
  );
  lines.push(
    `  Avg score (cand.)  : ${stats.avgCandidateScore !== null ? stats.avgCandidateScore.toFixed(2) : "—"}`
  );
  lines.push("");
  lines.push("  ── sessionPhase ──");
  for (const [phase, n] of Object.entries(stats.bySessionPhase).sort(
    (a, b) => b[1] - a[1]
  )) {
    lines.push(`    ${phase.padEnd(14)} ${n}`);
  }
  lines.push("");
  lines.push("  ── symbol (records) ──");
  for (const [sym, n] of Object.entries(stats.bySymbol).sort(
    (a, b) => b[1] - a[1]
  )) {
    lines.push(`    ${sym.padEnd(10)} ${n}`);
  }
  lines.push("");
  lines.push(`  Top candidate symbols (top ${stats.topN})`);
  if (stats.topCandidateSymbols.length === 0) {
    lines.push("    (none)");
  } else {
    for (const row of stats.topCandidateSymbols) {
      lines.push(`    ${row.symbol.padEnd(10)} ${row.candidateCount} candidate ticks`);
    }
  }
  lines.push("");
  lines.push(`  AFTER_HOURS candidates : ${stats.afterHoursCandidateCount}`);
  lines.push("");
  lines.push("  ── REGULAR only ──");
  lines.push(`  Regular records       : ${stats.regularRecords}`);
  lines.push(`  Regular candidates    : ${stats.regularCandidates}`);
  lines.push(
    `  Regular cand. ratio   : ${(stats.regularCandidateRatio * 100).toFixed(2)}%`
  );
  lines.push(
    `  Regular avg score     : ${
      stats.regularAvgScore !== null ? stats.regularAvgScore.toFixed(2) : "—"
    }`
  );
  lines.push(
    `  Regular avg cand.     : ${
      stats.regularCandidateAvgScore !== null
        ? stats.regularCandidateAvgScore.toFixed(2)
        : "—"
    }`
  );
  lines.push("  Regular top candidate symbols");
  if (stats.regularTopCandidateSymbols.length === 0) {
    lines.push("    (none)");
  } else {
    for (const row of stats.regularTopCandidateSymbols) {
      lines.push(`    ${row.symbol.padEnd(10)} ${row.candidateCount} candidate ticks`);
    }
  }
  lines.push("");
  if (warnings.length === 0) {
    lines.push("  Warnings: none");
  } else {
    lines.push("  Warnings");
    for (const w of warnings) {
      lines.push(`    [${w.code}] ${w.message}`);
    }
  }
  lines.push("══════════════════════════════════════════════════════════════");
  return lines.join("\n");
}
