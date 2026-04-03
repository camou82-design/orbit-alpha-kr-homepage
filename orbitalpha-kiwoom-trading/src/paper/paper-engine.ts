import {
  selectPumpEntryCandidates,
  type PumpEntryExclusion,
  type PumpEntryPick,
} from "../core/pump-selector.js";
import { evaluateScore } from "../core/scoring.js";
import {
  evaluateWeekendRisk,
  isMondayEarlyGapWindow,
  isMondayRegularOpenWindow,
  isMondayRegularSessionWindow,
  type MondayClockInput,
} from "../core/monday-filter.js";
import type { GlobalRiskSnapshot, ScoringInput, WeekendRiskSnapshot } from "../core/types.js";
import { evaluateUsRisk, type UsRiskEvaluation } from "../core/us-risk-filter.js";
import type { AppConfig } from "../infra/config.js";
import { appendLogLine, getPaperLoopLogPath } from "../infra/log-file.js";
import type { Logger } from "../infra/logger.js";
import { clockNow } from "../infra/clock.js";
import type { MarketDataAdapter } from "../kiwoom/market-data.js";
import { getMockGlobalRiskSnapshot } from "../kiwoom/mock-global-risk.js";
import { getMockWeekendRiskSnapshot } from "../kiwoom/mock-weekend-risk.js";
import { getEffectiveMarketSessionPhase } from "../kiwoom/market-hours.js";
import { distanceToUpperLimitPct, resolveUpperLimitPrice } from "../kiwoom/upper-limit.js";
import type { UniverseFilter } from "../kiwoom/universe.js";
import {
  appendSignalJsonlRecords,
  getSignalsJsonlPath,
  type SignalRecord,
} from "../reports/signals-jsonl.js";
import {
  appendTradeJsonlRecord,
  getTradesJsonlPath,
} from "../reports/trades-jsonl.js";
import {
  buildPaperDashboardSnapshot,
  writePaperDashboardSnapshot,
  type PaperFillRow,
} from "../infra/paper-dashboard-snapshot.js";
import { SimpleFillSimulator } from "./fill-simulator.js";
import { computeKoreanPaperPnL } from "./korean-cost-pnl.js";
import { evaluatePaperExit } from "./paper-exit.js";
import { PaperBroker } from "./paper-broker.js";

export interface PaperLoopDeps {
  config: AppConfig;
  logger: Logger;
  market: MarketDataAdapter;
  universe: UniverseFilter;
  clock?: () => Date;
  broker?: PaperBroker;
  fillSimulator?: SimpleFillSimulator;
}

/**
 * Main loop entry for paper/shadow mode (mock data + signals JSONL; no live orders).
 */
export function preparePaperEngine(logger: Logger, config: AppConfig): void {
  logger.info("paper.engine", {
    msg: "paper engine ready (mock market data, no live broker)",
    loopIntervalMs: config.loopIntervalMs,
    signalsDir: config.signalsDir,
    logsDir: config.logsDir,
    tradesDir: config.tradesDir,
    maxTicks: config.paperLoopMaxTicks ?? "until SIGINT",
    forceSessionPhase: config.forceSessionPhase,
    experimentTag: config.experimentTag,
    paperTrading: config.paperTrading,
    paperMaxOpenPositions: config.paperMaxOpenPositions,
    paperEntryMinScore: config.paperEntryMinScore,
    paperStopLossPct: config.paperStopLossPct,
    paperTakeProfitPct: config.paperTakeProfitPct,
    paperMaxHoldTicks: config.paperMaxHoldTicks,
    paperTrailingStopPct: config.paperTrailingStopPct,
    paperPositionSizeKrw: config.paperPositionSizeKrw,
    paperMinHeadroomToUpperLimitPct: config.paperMinHeadroomToUpperLimitPct,
    paperMaxChangeFromPrevClosePct: config.paperMaxChangeFromPrevClosePct,
    paperMaxUpperWickRatioPct: config.paperMaxUpperWickRatioPct,
    usFilterEnabled: config.usFilterEnabled,
    usRiskBlockMode: config.usRiskBlockMode,
    usMockRiskScenario: config.usMockRiskScenario,
    mondayFilterEnabled: config.mondayFilterEnabled,
    mondayOpenBlockMinutes: config.mondayOpenBlockMinutes,
    mondayMockWeekendScenario: config.mondayMockWeekendScenario,
    kiwoomFeeBuyPct: config.kiwoomFeeBuyPct,
    kiwoomFeeSellPct: config.kiwoomFeeSellPct,
    kiwoomTaxSellPct: config.kiwoomTaxSellPct,
    paperIncludeTax: config.paperIncludeTax,
    paperCostEdgeBufferPct: config.paperCostEdgeBufferPct,
  });
}

async function runOneTick(
  deps: PaperLoopDeps,
  tickIndex: number,
  broker: PaperBroker,
  fillSimulator: SimpleFillSimulator,
  fillHistory: PaperFillRow[]
): Promise<void> {
  const { config, logger, market, universe } = deps;
  const clock = deps.clock ?? clockNow;
  const now = clock();
  const { effectiveSessionPhase, forcedSessionPhase } = getEffectiveMarketSessionPhase(
    now,
    config.forceSessionPhase
  );

  const symbols = await market.listSymbols();
  const quotes = await market.getQuotes(symbols);
  const filtered = await universe.filter(symbols, { quotesBySymbol: quotes });

  const records: SignalRecord[] = [];
  for (const sym of filtered) {
    const q = quotes.get(sym);
    if (!q) continue;
    const input: ScoringInput = {
      price: q.lastPrice,
      prevClose: q.prevClose,
      turnover: q.turnover,
      isTradable: q.status === "NORMAL",
    };
    const { score, reason } = evaluateScore(input);
    const candidate =
      score >= config.signalCandidateMinScore &&
      effectiveSessionPhase === "REGULAR" &&
      input.isTradable;

    const upperLimitPrice = resolveUpperLimitPrice(q);
    const upperLimitHeadroomPct =
      upperLimitPrice != null
        ? distanceToUpperLimitPct(q.lastPrice, upperLimitPrice)
        : null;

    records.push({
      timestamp: now.toISOString(),
      sessionPhase: effectiveSessionPhase,
      symbol: sym,
      price: q.lastPrice,
      turnover: q.turnover,
      score,
      reason,
      candidate,
      upperLimitPrice,
      upperLimitHeadroomPct,
    });
  }

  const jsonlPath = getSignalsJsonlPath(config.signalsDir, now, config.experimentTag);
  await appendSignalJsonlRecords(jsonlPath, records);

  const candidateCount = records.filter((r) => r.candidate).length;

  let openedThisTick = 0;
  let closedThisTick = 0;
  let tradesPath: string | null = null;
  let pumpExcludedCount = 0;
  let picks: PumpEntryPick[] = [];
  let excluded: PumpEntryExclusion[] = [];
  let usRiskTick:
    | { snapshot: GlobalRiskSnapshot; evaluation: UsRiskEvaluation }
    | undefined;
  let mondayTickInfo:
    | {
        isMonday: boolean;
        isMondayOpenWindow: boolean;
        weekendRiskCount: number;
        weekendRiskReasons: string[];
        weekendRiskBlocked: boolean;
        weekendRiskPenalized: boolean;
      }
    | undefined;

  if (config.paperTrading) {
    tradesPath = getTradesJsonlPath(config.tradesDir, now, config.experimentTag);

    if (config.usFilterEnabled) {
      const snapshot = getMockGlobalRiskSnapshot(config.usMockRiskScenario);
      const evaluation = evaluateUsRisk(snapshot, {
        nasdaqFuturesNegativePct: config.usNasdaqFuturesNegativePct,
        usdkrwPositivePct: config.usUsdkrwPositivePct,
        kospi200FuturesNegativePct: config.usKospi200FuturesNegativePct,
      });
      usRiskTick = { snapshot, evaluation };
    }

    const mondayClock: MondayClockInput = {
      now,
      effectiveSessionPhase,
      forcedSessionPhase,
      devSimulateWeekday: config.mondayDevSimulateWeekday,
      devSimulateMinutesAfterOpen: config.mondayDevSimulateMinutesAfterOpen,
    };

    const wdMonday =
      config.mondayDevSimulateWeekday ?? now.getDay();
    const isMonday = wdMonday === 1;

    let weekendRiskEval = {
      riskCount: 0,
      shouldBlock: false,
      shouldPenalize: false,
      reasons: [] as string[],
    };
    let mondayOpenBlockWindow = false;
    let mondayEarlyGapWindow = false;
    let mondayRegularSession = false;

    if (config.mondayFilterEnabled) {
      const mockWeekendBase = getMockWeekendRiskSnapshot(
        config.mondayMockWeekendScenario
      );
      const weekendRiskSnapshot: WeekendRiskSnapshot = {
        ...mockWeekendBase,
        usRiskOff: usRiskTick?.evaluation.isRiskOff ?? false,
      };
      weekendRiskEval = evaluateWeekendRisk(weekendRiskSnapshot, {
        weekendRiskBlockThreshold: config.mondayWeekendRiskBlockThreshold,
        weekendRiskPenaltyThreshold: config.mondayWeekendRiskPenaltyThreshold,
      });
      const mondayGapWindowMinutes =
        config.mondayOpenBlockMinutes > 0
          ? config.mondayOpenBlockMinutes
          : 10;
      mondayOpenBlockWindow =
        config.mondayOpenBlockMinutes > 0 &&
        isMondayRegularOpenWindow(mondayClock, config.mondayOpenBlockMinutes);
      mondayEarlyGapWindow = isMondayEarlyGapWindow(
        mondayClock,
        mondayGapWindowMinutes
      );
      mondayRegularSession = isMondayRegularSessionWindow(mondayClock);
      mondayTickInfo = {
        isMonday,
        isMondayOpenWindow: mondayOpenBlockWindow,
        weekendRiskCount: weekendRiskEval.riskCount,
        weekendRiskReasons: weekendRiskEval.reasons,
        weekendRiskBlocked: weekendRiskEval.shouldBlock,
        weekendRiskPenalized:
          weekendRiskEval.shouldPenalize && !weekendRiskEval.shouldBlock,
      };
    }

    for (const p of broker.listOpenPositions()) {
      const q = quotes.get(p.symbol);
      if (!q) continue;
      broker.markToMarket(p.symbol, q.lastPrice);
    }

    for (const p of [...broker.listOpenPositions()]) {
      const q = quotes.get(p.symbol);
      if (!q) continue;
      const reason = evaluatePaperExit(
        p,
        q.lastPrice,
        tickIndex,
        config.paperMaxHoldTicks
      );
      if (!reason) continue;

      const exitPx = fillSimulator.fillSellAtMark(q.lastPrice);
      const closed = broker.closePosition(p.symbol, exitPx, reason);
      if (!closed) continue;

      closedThisTick += 1;
      const { position, exitPrice, closeReason } = closed;
      const cost = computeKoreanPaperPnL({
        entryPrice: position.entryPrice,
        exitPrice,
        quantity: position.quantity,
        feeBuyPct: config.kiwoomFeeBuyPct,
        feeSellPct: config.kiwoomFeeSellPct,
        taxSellPct: config.kiwoomTaxSellPct,
        includeTax: config.paperIncludeTax,
      });
      const pnlKrw = cost.finalNetPnlKrw;
      const pnlPct = cost.finalNetPnlPct;

      logger.info("paper.close", {
        symbol: position.symbol,
        exitPrice,
        pnlPct: Number(pnlPct.toFixed(4)),
        grossPnlPct: Number(cost.grossPnlPct.toFixed(4)),
        closeReason,
        entryPrice: position.entryPrice,
        quantity: position.quantity,
        grossPnlKrw: cost.grossPnlKrw,
        feeBuyKrw: cost.feeBuyKrw,
        feeSellKrw: cost.feeSellKrw,
        taxSellKrw: cost.taxSellKrw,
        netPnlAfterFeeKrw: cost.netPnlAfterFeeKrw,
        finalNetPnlKrw: cost.finalNetPnlKrw,
      });

      await appendTradeJsonlRecord(tradesPath, {
        openedAt: position.entryTime,
        closedAt: now.toISOString(),
        symbol: position.symbol,
        entryPrice: position.entryPrice,
        exitPrice,
        quantity: position.quantity,
        pnlPct,
        pnlKrw,
        grossPnlKrw: cost.grossPnlKrw,
        feeBuyKrw: cost.feeBuyKrw,
        feeSellKrw: cost.feeSellKrw,
        taxSellKrw: cost.taxSellKrw,
        netPnlAfterFeeKrw: cost.netPnlAfterFeeKrw,
        finalNetPnlKrw: cost.finalNetPnlKrw,
        closeReason,
        experimentTag: config.experimentTag,
      });

      fillHistory.push({
        time: now.toISOString(),
        symbol: position.symbol,
        name: quotes.get(position.symbol)?.name ?? position.symbol,
        action: "SELL",
        price: exitPrice,
        quantity: position.quantity,
        reason: closeReason,
      });
      if (fillHistory.length > 100) {
        fillHistory.splice(0, fillHistory.length - 100);
      }
    }

    const openSymbols = new Set(broker.listOpenPositions().map((p) => p.symbol));
    const sel = selectPumpEntryCandidates({
      records,
      quotes,
      entryMinScore: config.paperEntryMinScore,
      entryMinTurnoverKrw: config.universeMinTurnoverKrw,
      maxEntriesThisTick: config.paperMaxEntriesPerTick,
      openSymbols,
      minHeadroomToUpperLimitPct: config.paperMinHeadroomToUpperLimitPct,
      maxChangeFromPrevClosePct: config.paperMaxChangeFromPrevClosePct,
      maxUpperWickRatioPct: config.paperMaxUpperWickRatioPct,
      usFilterEnabled: config.usFilterEnabled,
      usRiskBlockMode: config.usRiskBlockMode,
      usRiskScorePenalty: config.usRiskScorePenalty,
      usRiskEvaluation: usRiskTick?.evaluation ?? {
        isRiskOff: false,
        reasons: [],
      },
      globalRiskSnapshot: usRiskTick?.snapshot ?? {
        nasdaqFuturesPct: 0,
        usdkrwChangePct: 0,
        kospi200FuturesPct: 0,
      },
      mondayFilterEnabled: config.mondayFilterEnabled,
      mondayIsMonday: isMonday,
      isMondayOpenBlockWindow: mondayOpenBlockWindow,
      isMondayEarlyGapWindow: mondayEarlyGapWindow,
      isMondayRegularSession: mondayRegularSession,
      mondayGapStricterPct: config.mondayGapStricterPct,
      mondayExtraScorePenalty: config.mondayExtraScorePenalty,
      weekendRiskEval,
      kiwoomFeeBuyPct: config.kiwoomFeeBuyPct,
      kiwoomFeeSellPct: config.kiwoomFeeSellPct,
      kiwoomTaxSellPct: config.kiwoomTaxSellPct,
      paperIncludeTax: config.paperIncludeTax,
      paperFillSlippagePct: config.paperFillSlippagePct,
      paperCostEdgeBufferPct: config.paperCostEdgeBufferPct,
      paperTakeProfitPct: config.paperTakeProfitPct,
    });
    picks = sel.picks;
    excluded = sel.excluded;
    pumpExcludedCount = excluded.length;

    if (excluded.length > 0) {
      logger.info("paper.pump.exclude", {
        tick: tickIndex,
        count: excluded.length,
        items: excluded.map((e) => ({
          symbol: e.symbol,
          reason: e.reason,
          upperLimitPrice: e.upperLimitPrice,
          upperLimitHeadroomPct: e.headroomPct,
          changeFromPrevClosePct: e.changeFromPrevClosePct,
          upperWickRatioPct: e.upperWickRatioPct,
          prevClose: e.prevClose,
          highPrice: e.highPrice,
          lowPrice: e.lowPrice,
          currentPrice: e.currentPrice,
          ...(e.reason === "us_risk_off" && e.globalRiskSnapshot
            ? {
                usRiskOff: true,
                usRiskReasons: e.usRiskReasons,
                nasdaqFuturesPct: e.globalRiskSnapshot.nasdaqFuturesPct,
                usdkrwChangePct: e.globalRiskSnapshot.usdkrwChangePct,
                kospi200FuturesPct: e.globalRiskSnapshot.kospi200FuturesPct,
              }
            : {}),
          ...(e.reason === "monday_open_block" ||
          e.reason === "monday_weekend_risk_block" ||
          e.reason === "monday_gap_overextended"
            ? {
                isMonday: e.isMonday,
                isMondayOpenWindow: e.isMondayOpenWindow,
                weekendRiskCount: e.weekendRiskCount,
                weekendRiskReasons: e.weekendRiskReasons,
                effectiveGapLimitPct: e.effectiveGapLimitPct,
              }
            : {}),
          ...(e.reason === "insufficient_edge_after_cost"
            ? {
                minRequiredPct: e.minRequiredPct,
                estimatedMovePct: e.estimatedMovePct,
                costEdgeThresholdPct: e.costEdgeThresholdPct,
              }
            : {}),
        })),
      });
    }

    for (const pick of picks) {
      if (broker.openCount() >= config.paperMaxOpenPositions) break;
      if (broker.hasOpen(pick.symbol)) continue;
      const q = quotes.get(pick.symbol);
      if (!q || q.status !== "NORMAL") continue;

      const entryPx = fillSimulator.fillBuyAtMark(q.lastPrice);
      const qty = Math.max(1, Math.floor(config.paperPositionSizeKrw / entryPx));

      broker.openPosition({
        symbol: pick.symbol,
        quantity: qty,
        entryPrice: entryPx,
        entryTimeIso: now.toISOString(),
        entryTickIndex: tickIndex,
        stopLossPct: config.paperStopLossPct,
        takeProfitPct: config.paperTakeProfitPct,
        trailingStopPct: config.paperTrailingStopPct,
      });

      openedThisTick += 1;
      const qu = quotes.get(pick.symbol);
      const upper = qu ? resolveUpperLimitPrice(qu) : null;
      const headroom =
        qu && upper != null
          ? distanceToUpperLimitPct(qu.lastPrice, upper)
          : null;

      logger.info("paper.open", {
        symbol: pick.symbol,
        entryPrice: entryPx,
        score: pick.score,
        reason: pick.reason,
        quantity: qty,
        upperLimitPrice: upper,
        upperLimitHeadroomPct: headroom,
      });

      fillHistory.push({
        time: now.toISOString(),
        symbol: pick.symbol,
        name: q.name,
        action: "BUY",
        price: entryPx,
        quantity: qty,
        reason: pick.reason,
      });
      if (fillHistory.length > 100) {
        fillHistory.splice(0, fillHistory.length - 100);
      }
    }
  }

  const logPath = getPaperLoopLogPath(config.logsDir, now, config.experimentTag);
  const summary = {
    tick: tickIndex,
    ts: now.toISOString(),
    effectiveSessionPhase,
    forcedSessionPhase,
    experimentTag: config.experimentTag,
    symbolsFetched: symbols.length,
    filteredCount: filtered.length,
    candidateCount,
    jsonlPath,
    recordsWritten: records.length,
    openPositions: config.paperTrading ? broker.openCount() : 0,
    openedThisTick: config.paperTrading ? openedThisTick : 0,
    closedThisTick: config.paperTrading ? closedThisTick : 0,
    pumpExcludedCount: config.paperTrading ? pumpExcludedCount : 0,
    tradesPath,
    ...(config.paperTrading && config.usFilterEnabled && usRiskTick
      ? {
          usRiskOff: usRiskTick.evaluation.isRiskOff,
          nasdaqFuturesPct: usRiskTick.snapshot.nasdaqFuturesPct,
          usdkrwChangePct: usRiskTick.snapshot.usdkrwChangePct,
          kospi200FuturesPct: usRiskTick.snapshot.kospi200FuturesPct,
          usRiskReasons: usRiskTick.evaluation.reasons,
        }
      : {}),
    ...(config.paperTrading && config.mondayFilterEnabled && mondayTickInfo
      ? {
          isMonday: mondayTickInfo.isMonday,
          isMondayOpenWindow: mondayTickInfo.isMondayOpenWindow,
          weekendRiskCount: mondayTickInfo.weekendRiskCount,
          weekendRiskReasons: mondayTickInfo.weekendRiskReasons,
          weekendRiskBlocked: mondayTickInfo.weekendRiskBlocked,
          weekendRiskPenalized: mondayTickInfo.weekendRiskPenalized,
        }
      : {}),
  };

  logger.info("paper.tick", summary);
  await appendLogLine(logPath, JSON.stringify(summary));

  writePaperDashboardSnapshot(
    buildPaperDashboardSnapshot({
      now,
      tickIndex,
      effectiveSessionPhase,
      experimentTag: config.experimentTag,
      paperTrading: config.paperTrading,
      paperEntryMinScore: config.paperEntryMinScore,
      universeMinTurnoverKrw: config.universeMinTurnoverKrw,
      records,
      quotes,
      picks,
      excluded,
      openPositions: broker.listOpenPositions(),
      recentFills: fillHistory,
    })
  );
}

export async function startPaperLoop(deps: PaperLoopDeps): Promise<void> {
  const { config, logger } = deps;
  const intervalMs = config.loopIntervalMs;

  const broker = deps.broker ?? new PaperBroker();
  const fillHistory: PaperFillRow[] = [];
  const fillSimulator =
    deps.fillSimulator ?? new SimpleFillSimulator(config.paperFillSlippagePct);

  logger.info("paper.loop", {
    msg: "starting paper loop",
    intervalMs,
    universeMinTurnoverKrw: config.universeMinTurnoverKrw,
    candidateMinScore: config.signalCandidateMinScore,
    forceSessionPhase: config.forceSessionPhase,
    experimentTag: config.experimentTag,
    paperTrading: config.paperTrading,
    paperMinHeadroomToUpperLimitPct: config.paperMinHeadroomToUpperLimitPct,
    paperMaxChangeFromPrevClosePct: config.paperMaxChangeFromPrevClosePct,
    paperMaxUpperWickRatioPct: config.paperMaxUpperWickRatioPct,
    usFilterEnabled: config.usFilterEnabled,
    usRiskBlockMode: config.usRiskBlockMode,
    usMockRiskScenario: config.usMockRiskScenario,
    mondayFilterEnabled: config.mondayFilterEnabled,
    mondayOpenBlockMinutes: config.mondayOpenBlockMinutes,
    mondayMockWeekendScenario: config.mondayMockWeekendScenario,
    kiwoomFeeBuyPct: config.kiwoomFeeBuyPct,
    kiwoomFeeSellPct: config.kiwoomFeeSellPct,
    kiwoomTaxSellPct: config.kiwoomTaxSellPct,
    paperIncludeTax: config.paperIncludeTax,
    paperCostEdgeBufferPct: config.paperCostEdgeBufferPct,
  });

  let tickIndex = 0;
  let running = false;
  let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  let timer: ReturnType<typeof setInterval> | undefined;

  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      tickIndex += 1;
      await runOneTick(deps, tickIndex, broker, fillSimulator, fillHistory);
      if (
        config.paperLoopMaxTicks != null &&
        tickIndex >= config.paperLoopMaxTicks
      ) {
        logger.info("paper.loop", { msg: "stopped (max ticks)", tickIndex });
        if (timer !== undefined) clearInterval(timer);
        resolveDone?.();
      }
    } catch (e) {
      logger.error("paper.tick failed", e);
    } finally {
      running = false;
    }
  };

  await run();
  const finishedByMax =
    config.paperLoopMaxTicks != null && tickIndex >= config.paperLoopMaxTicks;
  if (!finishedByMax) {
    timer = setInterval(() => {
      void run();
    }, intervalMs);
  }

  const shutdown = (): void => {
    if (timer !== undefined) clearInterval(timer);
    logger.info("paper.loop", { msg: "shutdown" });
    resolveDone?.();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await done;
}
