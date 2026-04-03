import type { GlobalRiskSnapshot } from "./types.js";
import type { WeekendRiskEvalResult } from "./monday-filter.js";
import type { UsRiskEvaluation } from "./us-risk-filter.js";
import type { MarketQuote } from "../kiwoom/types.js";
import {
  changeFromPrevClosePct,
  resolveQuoteOhlc,
  upperWickRatioPct,
} from "../kiwoom/price-filters.js";
import { computeMinRequiredCostPct } from "../paper/korean-cost-pnl.js";
import { distanceToUpperLimitPct, resolveUpperLimitPrice } from "../kiwoom/upper-limit.js";

/** Minimal row shape from the signal loop (avoids core → reports import). */
export interface PumpSignalRow {
  candidate: boolean;
  sessionPhase: string;
  symbol: string;
  score: number;
  reason: string;
  turnover: number;
}

export interface PumpSelectParams {
  records: readonly PumpSignalRow[];
  quotes: ReadonlyMap<string, MarketQuote>;
  entryMinScore: number;
  entryMinTurnoverKrw: number;
  maxEntriesThisTick: number;
  openSymbols: ReadonlySet<string>;
  minHeadroomToUpperLimitPct: number;
  maxChangeFromPrevClosePct: number;
  maxUpperWickRatioPct: number;
  usFilterEnabled: boolean;
  usRiskBlockMode: boolean;
  usRiskScorePenalty: number;
  usRiskEvaluation: UsRiskEvaluation;
  globalRiskSnapshot: GlobalRiskSnapshot;
  mondayFilterEnabled: boolean;
  mondayIsMonday: boolean;
  isMondayOpenBlockWindow: boolean;
  isMondayEarlyGapWindow: boolean;
  isMondayRegularSession: boolean;
  mondayGapStricterPct: number;
  mondayExtraScorePenalty: number;
  weekendRiskEval: WeekendRiskEvalResult;
  kiwoomFeeBuyPct: number;
  kiwoomFeeSellPct: number;
  kiwoomTaxSellPct: number;
  paperIncludeTax: boolean;
  paperFillSlippagePct: number;
  paperCostEdgeBufferPct: number;
  paperTakeProfitPct: number;
}

export interface PumpEntryPick {
  symbol: string;
  score: number;
  reason: string;
}

export type PumpExclusionReason =
  | "low_upper_limit_headroom"
  | "overextended_from_prev_close"
  | "excessive_upper_wick"
  | "us_risk_off"
  | "monday_open_block"
  | "monday_weekend_risk_block"
  | "monday_gap_overextended"
  | "insufficient_edge_after_cost";

export interface PumpEntryExclusion {
  symbol: string;
  reason: PumpExclusionReason;
  headroomPct: number | null;
  upperLimitPrice: number | null;
  changeFromPrevClosePct: number | null;
  upperWickRatioPct: number | null;
  prevClose: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  currentPrice: number | null;
  usRiskReasons?: string[] | null;
  globalRiskSnapshot?: GlobalRiskSnapshot | null;
  isMonday?: boolean | null;
  isMondayOpenWindow?: boolean | null;
  weekendRiskCount?: number | null;
  weekendRiskReasons?: string[] | null;
  effectiveGapLimitPct?: number | null;
  minRequiredPct?: number | null;
  estimatedMovePct?: number | null;
  costEdgeThresholdPct?: number | null;
}

export interface PumpSelectResult {
  picks: PumpEntryPick[];
  excluded: PumpEntryExclusion[];
}

function buildExclusion(
  symbol: string,
  reason: PumpExclusionReason,
  q: MarketQuote,
  upper: number | null,
  headroom: number | null,
  extra?: Partial<
    Pick<
      PumpEntryExclusion,
      | "isMonday"
      | "isMondayOpenWindow"
      | "weekendRiskCount"
      | "weekendRiskReasons"
      | "effectiveGapLimitPct"
      | "minRequiredPct"
      | "estimatedMovePct"
      | "costEdgeThresholdPct"
    >
  >
): PumpEntryExclusion {
  const ohlc = resolveQuoteOhlc(q);
  const changePct =
    ohlc != null ? changeFromPrevClosePct(ohlc.prevClose, ohlc.currentPrice) : null;
  const wickPct =
    ohlc != null
      ? upperWickRatioPct(ohlc.highPrice, ohlc.lowPrice, ohlc.currentPrice)
      : null;
  return {
    symbol,
    reason,
    headroomPct: headroom,
    upperLimitPrice: upper,
    changeFromPrevClosePct: changePct,
    upperWickRatioPct: wickPct,
    prevClose: ohlc?.prevClose ?? null,
    highPrice: ohlc?.highPrice ?? null,
    lowPrice: ohlc?.lowPrice ?? null,
    currentPrice: ohlc?.currentPrice ?? null,
    ...extra,
  };
}

function buildUsRiskExclusion(
  symbol: string,
  q: MarketQuote,
  upper: number | null,
  headroom: number | null,
  snapshot: GlobalRiskSnapshot,
  reasons: string[]
): PumpEntryExclusion {
  return {
    ...buildExclusion(symbol, "us_risk_off", q, upper, headroom),
    usRiskReasons: reasons,
    globalRiskSnapshot: snapshot,
  };
}

interface ScoredRow {
  row: PumpSignalRow;
  effectiveScore: number;
}

/**
 * Upbit-style "pump" shortlist: KRX filters + optional US + Monday weekend-news rules.
 */
export function selectPumpEntryCandidates(params: PumpSelectParams): PumpSelectResult {
  const {
    records,
    quotes,
    entryMinScore,
    entryMinTurnoverKrw,
    maxEntriesThisTick,
    openSymbols,
    minHeadroomToUpperLimitPct,
    maxChangeFromPrevClosePct,
    maxUpperWickRatioPct,
    usFilterEnabled,
    usRiskBlockMode,
    usRiskScorePenalty,
    usRiskEvaluation,
    globalRiskSnapshot,
    mondayFilterEnabled,
    mondayIsMonday,
    isMondayOpenBlockWindow,
    isMondayEarlyGapWindow,
    isMondayRegularSession,
    mondayGapStricterPct,
    mondayExtraScorePenalty,
    weekendRiskEval,
    kiwoomFeeBuyPct,
    kiwoomFeeSellPct,
    kiwoomTaxSellPct,
    paperIncludeTax,
    paperFillSlippagePct,
    paperCostEdgeBufferPct,
    paperTakeProfitPct,
  } = params;

  const excluded: PumpEntryExclusion[] = [];
  const rows: ScoredRow[] = [];

  for (const r of records) {
    if (!r.candidate) continue;
    if (r.sessionPhase !== "REGULAR") continue;
    if (r.score < entryMinScore) continue;
    if (r.turnover < entryMinTurnoverKrw) continue;
    if (openSymbols.has(r.symbol)) continue;
    const q = quotes.get(r.symbol);
    if (!q || q.status !== "NORMAL") continue;

    const upper = resolveUpperLimitPrice(q);
    const headroom =
      upper != null ? distanceToUpperLimitPct(q.lastPrice, upper) : null;

    if (headroom === null || headroom < minHeadroomToUpperLimitPct) {
      excluded.push(
        buildExclusion(r.symbol, "low_upper_limit_headroom", q, upper, headroom)
      );
      continue;
    }

    const minCostPct = computeMinRequiredCostPct({
      feeBuyPct: kiwoomFeeBuyPct,
      feeSellPct: kiwoomFeeSellPct,
      taxSellPct: kiwoomTaxSellPct,
      includeTax: paperIncludeTax,
      fillSlippagePct: paperFillSlippagePct,
    });
    const costEdgeThresholdPct = minCostPct + paperCostEdgeBufferPct;
    const estimatedMovePct = Math.min(headroom, paperTakeProfitPct);
    if (estimatedMovePct < costEdgeThresholdPct) {
      excluded.push(
        buildExclusion(
          r.symbol,
          "insufficient_edge_after_cost",
          q,
          upper,
          headroom,
          {
            minRequiredPct: minCostPct,
            estimatedMovePct,
            costEdgeThresholdPct,
          }
        )
      );
      continue;
    }

    if (mondayFilterEnabled && isMondayOpenBlockWindow) {
      excluded.push(
        buildExclusion(r.symbol, "monday_open_block", q, upper, headroom, {
          isMonday: mondayIsMonday,
          isMondayOpenWindow: true,
        })
      );
      continue;
    }

    const ohlc = resolveQuoteOhlc(q);
    const changePct =
      ohlc != null ? changeFromPrevClosePct(ohlc.prevClose, ohlc.currentPrice) : null;
    const wickPct =
      ohlc != null
        ? upperWickRatioPct(ohlc.highPrice, ohlc.lowPrice, ohlc.currentPrice)
        : null;

    const effectiveGapLimitPct =
      mondayFilterEnabled && isMondayEarlyGapWindow
        ? mondayGapStricterPct
        : maxChangeFromPrevClosePct;

    if (changePct != null && changePct > effectiveGapLimitPct) {
      const gapReason: PumpExclusionReason =
        mondayFilterEnabled && isMondayEarlyGapWindow
          ? "monday_gap_overextended"
          : "overextended_from_prev_close";
      excluded.push(
        buildExclusion(r.symbol, gapReason, q, upper, headroom, {
          isMonday: mondayIsMonday,
          isMondayOpenWindow: isMondayOpenBlockWindow,
          effectiveGapLimitPct,
        })
      );
      continue;
    }

    if (wickPct != null && wickPct > maxUpperWickRatioPct) {
      excluded.push(
        buildExclusion(r.symbol, "excessive_upper_wick", q, upper, headroom)
      );
      continue;
    }

    if (
      mondayFilterEnabled &&
      isMondayRegularSession &&
      weekendRiskEval.shouldBlock
    ) {
      excluded.push(
        buildExclusion(
          r.symbol,
          "monday_weekend_risk_block",
          q,
          upper,
          headroom,
          {
            isMonday: mondayIsMonday,
            isMondayOpenWindow: isMondayOpenBlockWindow,
            weekendRiskCount: weekendRiskEval.riskCount,
            weekendRiskReasons: weekendRiskEval.reasons,
          }
        )
      );
      continue;
    }

    let penalty = 0;
    if (
      mondayFilterEnabled &&
      isMondayRegularSession &&
      weekendRiskEval.shouldPenalize &&
      !weekendRiskEval.shouldBlock
    ) {
      penalty += mondayExtraScorePenalty;
    }

    if (usFilterEnabled && usRiskEvaluation.isRiskOff) {
      if (usRiskBlockMode) {
        excluded.push(
          buildUsRiskExclusion(
            r.symbol,
            q,
            upper,
            headroom,
            globalRiskSnapshot,
            usRiskEvaluation.reasons
          )
        );
        continue;
      }
      penalty += usRiskScorePenalty;
    }

    rows.push({
      row: r,
      effectiveScore: r.score - penalty,
    });
  }

  rows.sort((a, b) => b.effectiveScore - a.effectiveScore);

  const picks: PumpEntryPick[] = [];
  const seen = new Set<string>();
  for (const { row, effectiveScore } of rows) {
    if (effectiveScore < entryMinScore) continue;
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    picks.push({ symbol: row.symbol, score: effectiveScore, reason: row.reason });
    if (picks.length >= maxEntriesThisTick) break;
  }
  return { picks, excluded };
}
