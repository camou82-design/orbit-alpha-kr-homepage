import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { PaperPosition } from "../core/types.js";
import type {
  PumpEntryExclusion,
  PumpEntryPick,
} from "../core/pump-selector.js";
import type { SignalRecord } from "../reports/signals-jsonl.js";
import type { MarketQuote } from "../kiwoom/types.js";

/** One row in the pump candidate table (paper dashboard). */
export interface PaperCandidateRow {
  name: string;
  symbol: string;
  lastPrice: number;
  score: number;
  /** 당 틱 펌프 진입 선정 여부 */
  entrySignal: boolean;
  /** 스코어링 진입 사유 */
  entryReason: string;
  /** 펌프·모의 레이어 차단 사유 (없으면 "—") */
  blockReason: string;
}

export interface PaperPositionRow {
  name: string;
  symbol: string;
  quantity: number;
  avgBuyPrice: number;
  lastPrice: number;
  evalPnlKrw: number;
  returnPct: number;
}

export interface PaperFillRow {
  time: string;
  symbol: string;
  name: string;
  action: "BUY" | "SELL";
  price: number;
  quantity: number;
  reason: string;
}

export interface PaperDashboardSnapshot {
  schemaVersion: 1;
  lastUpdated: string;
  paperOnly: true;
  experimentTag: string | null;
  tickIndex: number;
  effectiveSessionPhase: string;
  paperTradingEnabled: boolean;
  candidates: PaperCandidateRow[];
  positions: PaperPositionRow[];
  recentFills: PaperFillRow[];
}

const REASON_KO: Record<string, string> = {
  low_upper_limit_headroom: "상한가 잔여 여력 부족",
  overextended_from_prev_close: "전일 대비 상승률 과열",
  excessive_upper_wick: "윗꼬리 비율 과다",
  us_risk_off: "US·리스크 오프",
  monday_open_block: "월요일 장초 구간 제한",
  monday_weekend_risk_block: "주말 뉴스 리스크 차단",
  monday_gap_overextended: "월요일 갭 과열",
  insufficient_edge_after_cost: "비용·세금 대비 기대 수익 부족",
};

function formatExclusion(ex: PumpEntryExclusion): string {
  const base = REASON_KO[ex.reason] ?? ex.reason;
  if (ex.reason === "us_risk_off" && ex.usRiskReasons?.length) {
    return `${base} (${ex.usRiskReasons.join("; ")})`;
  }
  return base;
}

function quoteName(quotes: ReadonlyMap<string, MarketQuote>, symbol: string): string {
  return quotes.get(symbol)?.name ?? symbol;
}

function buildPositionRows(
  positions: readonly PaperPosition[],
  quotes: ReadonlyMap<string, MarketQuote>
): PaperPositionRow[] {
  return positions.map((p) => {
    const q = quotes.get(p.symbol);
    const last = q?.lastPrice ?? p.entryPrice;
    const name = q?.name ?? p.symbol;
    const cost = p.entryPrice * p.quantity;
    const mtm = last * p.quantity;
    const evalPnl = mtm - cost;
    const retPct = cost > 0 ? (evalPnl / cost) * 100 : 0;
    return {
      name,
      symbol: p.symbol,
      quantity: p.quantity,
      avgBuyPrice: Math.round(p.entryPrice),
      lastPrice: Math.round(last),
      evalPnlKrw: Math.round(evalPnl),
      returnPct: retPct,
    };
  });
}

function buildCandidateRows(
  records: readonly SignalRecord[],
  quotes: ReadonlyMap<string, MarketQuote>,
  opts: {
    paperTrading: boolean;
    paperEntryMinScore: number;
    universeMinTurnoverKrw: number;
    picks: readonly PumpEntryPick[];
    excluded: readonly PumpEntryExclusion[];
  }
): PaperCandidateRow[] {
  const pickSet = new Set(opts.picks.map((p) => p.symbol));
  const exBySym = new Map(opts.excluded.map((e) => [e.symbol, e]));

  const rows: PaperCandidateRow[] = records.map((r) => {
    const name = quoteName(quotes, r.symbol);
    const ex = exBySym.get(r.symbol);
    let blockReason = "—";

    if (!opts.paperTrading) {
      blockReason = "모의 체결·펌프 선별 비활성(PAPER_TRADING)";
    } else if (ex) {
      blockReason = formatExclusion(ex);
    } else if (pickSet.has(r.symbol)) {
      blockReason = "—";
    } else if (!r.candidate) {
      blockReason = "급등 후보 스코어 미달 또는 비거래";
    } else if (r.sessionPhase !== "REGULAR") {
      blockReason = "정규장 아님";
    } else if (r.score < opts.paperEntryMinScore) {
      blockReason = "펌프 최소 점수 미달";
    } else if (r.turnover < opts.universeMinTurnoverKrw) {
      blockReason = "유동성(거래대금) 최소 미달";
    } else {
      blockReason = "당일 틱 진입 한도 또는 순위 밖";
    }

    return {
      name,
      symbol: r.symbol,
      lastPrice: r.price,
      score: r.score,
      entrySignal: opts.paperTrading && pickSet.has(r.symbol),
      entryReason: r.reason,
      blockReason,
    };
  });

  rows.sort((a, b) => b.score - a.score);
  return rows;
}

export function buildPaperDashboardSnapshot(params: {
  now: Date;
  tickIndex: number;
  effectiveSessionPhase: string;
  experimentTag: string | null;
  paperTrading: boolean;
  paperEntryMinScore: number;
  universeMinTurnoverKrw: number;
  records: readonly SignalRecord[];
  quotes: ReadonlyMap<string, MarketQuote>;
  picks: readonly PumpEntryPick[];
  excluded: readonly PumpEntryExclusion[];
  openPositions: readonly PaperPosition[];
  recentFills: readonly PaperFillRow[];
}): PaperDashboardSnapshot {
  const maxFills = 100;
  const fills = params.recentFills.slice(-maxFills);
  return {
    schemaVersion: 1,
    lastUpdated: params.now.toISOString(),
    paperOnly: true,
    experimentTag: params.experimentTag,
    tickIndex: params.tickIndex,
    effectiveSessionPhase: params.effectiveSessionPhase,
    paperTradingEnabled: params.paperTrading,
    candidates: buildCandidateRows(params.records, params.quotes, {
      paperTrading: params.paperTrading,
      paperEntryMinScore: params.paperEntryMinScore,
      universeMinTurnoverKrw: params.universeMinTurnoverKrw,
      picks: params.picks,
      excluded: params.excluded,
    }),
    positions: buildPositionRows(params.openPositions, params.quotes),
    recentFills: fills,
  };
}

function defaultPath(): string {
  const fileOverride = process.env.PAPER_DASHBOARD_FILE?.trim();
  if (fileOverride && fileOverride.length > 0) {
    return isAbsolute(fileOverride) ? fileOverride : join(process.cwd(), fileOverride);
  }
  const projectRoot = process.env.KIWOOM_PROJECT_ROOT?.trim();
  if (projectRoot && projectRoot.length > 0) {
    const root = isAbsolute(projectRoot) ? projectRoot : join(process.cwd(), projectRoot);
    return join(root, "data", "paper-dashboard.json");
  }
  return join(process.cwd(), "data", "paper-dashboard.json");
}

/** Full replace each tick — paper loop only; no live imports. */
export function writePaperDashboardSnapshot(snapshot: PaperDashboardSnapshot): void {
  const path = defaultPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(snapshot, null, 2), "utf8");
}

export function getPaperDashboardPathForServer(): string {
  return defaultPath();
}

/** Read current file for HTTP server (best-effort). */
export function readPaperDashboardSnapshot(): PaperDashboardSnapshot | null {
  const path = defaultPath();
  try {
    const t = readFileSync(path, "utf8");
    return JSON.parse(t) as PaperDashboardSnapshot;
  } catch {
    return null;
  }
}
