/**
 * Live Auto-Trading Loop v1
 *
 * 장중 tick 반복: 시세 조회 → 신호 판단 → 주문 → 포지션 관리 → 청산 → JSONL 기록
 *
 * 절대 원칙:
 *  - 실주문 전송: kiwoomTrPost (kt10000 BUY / kt10001 SELL)
 *  - 포지션 상태: live-position-store.ts 에서만 변경
 *  - 에러 발생 시 해당 tick 스킵, 프로세스 중지 없음
 *  - 일 손실 제한 초과 시 루프 자동 중단
 *  - 기존 paper/live-test 경로 건드리지 않음
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { AppConfig } from "../infra/config.js";
import type { Logger } from "../infra/logger.js";
import { clockNow } from "../infra/clock.js";

import { fetchKiwoomAccessToken, isKiwoomTrBusinessOk, kiwoomTrPost } from "../kiwoom/kiwoom-rest.js";
import { fetchQuote, fetchAccountInfo, type KiwoomAccountInfoResult } from "./kiwoom-client.js";
import {
    evaluateCashOnlyBuyFunding,
    snapshotToPlain,
} from "./live-order-funding.js";
import { getEffectiveMarketSessionPhase } from "../kiwoom/market-hours.js";
import { evaluateScore } from "../core/scoring.js";
import { selectPumpEntryCandidates } from "../core/pump-selector.js";
import { computeKoreanPaperPnL } from "../paper/korean-cost-pnl.js";
import { appendTradeJsonlRecord, getTradesJsonlPath } from "../reports/trades-jsonl.js";
import { appendSignalJsonlRecords, getSignalsJsonlPath } from "../reports/signals-jsonl.js";
import { mergeMonitorSnapshot } from "../infra/monitor-snapshot.js";
import {
    openLivePosition,
    closeLivePosition,
    updateLivePosition,
    hasLivePosition,
    liveOpenCount,
    getLivePositions,
    snapshotLivePositions,
    type LivePosition,
} from "./live-position-store.js";
import type { ScoringInput } from "../core/types.js";
import type { SignalRecord } from "../reports/signals-jsonl.js";
import type { MarketQuote } from "../kiwoom/types.js";
import { distanceToUpperLimitPct, resolveUpperLimitPrice } from "../kiwoom/upper-limit.js";
import {
    evaluateLiveEntryGate,
    evaluateLiveForceExit,
    isWithinOrderCooldown,
    recordOrderTimestamp,
} from "./live-session-guard.js";
import {
    hasPendingOrderForSymbol,
    registerOrder,
    finalizeOrder,
    snapshotPendingOrders,
    findTimedOutOrders,
    markCancelRequested,
} from "./live-order-tracker.js";
import { evaluateLiveOperationalOrderGate } from "./live-ops-guard.js";
import {
    applyLossHaltIfNeeded,
    recordOrderAttempt,
    recordOrderBrokerResult,
    recordSymbolFlat,
    syncDailyRealizedPnlKrw,
} from "./live-ops-state.js";

// -----------------------------------------------------------------
// 설정 상수 (초기 10만원 기준; 추후 .env 로 이관 가능)
// -----------------------------------------------------------------
const LIVE_MAX_OPEN_POSITIONS = 2;        // 동시 최대 보유 종목
const LIVE_POSITION_SIZE_KRW = 45_000;   // 종목당 진입 금액
const LIVE_STOP_LOSS_PCT = 1.5;          // 손절 (%)
const LIVE_TAKE_PROFIT_PCT = 3.0;        // 익절 (%)
const LIVE_TRAILING_STOP_PCT = 1.2;      // trailing stop (고점 대비 %)
const LIVE_DAILY_LOSS_LIMIT_KRW = 2_000; // 일 손실 한도 (2%)
const LIVE_ENTRY_MIN_SCORE = 42;         // 최소 진입 점수

// -----------------------------------------------------------------
// 일 손익 추적 (프로세스 내 리셋)
// -----------------------------------------------------------------
let _dailyRealizedPnlKrw = 0;

/**
 * 시세 실패(parse/tr) 종목 — 다음 틱부터 유니버스 스캔에서 생략.
 * 보유 중인 종목은 청산 시세가 필요하므로 항상 재조회한다.
 */
const liveQuoteScanBlockedSymbols = new Set<string>();

// -----------------------------------------------------------------
// JSONL 주문/체결 로그 경로
// -----------------------------------------------------------------
function getOrdersJsonlPath(logsDir: string, when: Date): string {
    const y = when.getFullYear();
    const m = String(when.getMonth() + 1).padStart(2, "0");
    const d = String(when.getDate()).padStart(2, "0");
    return join(logsDir, `live-orders-${y}-${m}-${d}.jsonl`);
}

async function appendOrderLog(path: string, record: Record<string, unknown>): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, JSON.stringify(record) + "\n", "utf8");
}

// -----------------------------------------------------------------
// 실전 매수 주문 전송
// -----------------------------------------------------------------
async function sendBuyOrder(
    config: AppConfig,
    symbol: string,
    qty: number,
    price: number,
    logger: Logger
): Promise<{ ok: boolean; orderId?: string; message: string }> {
    const token = await fetchKiwoomAccessToken(config);
    if (!token.ok) {
        return { ok: false, message: `oauth_failed: ${token.message}` };
    }

    const body: Record<string, unknown> = {
        dmst_stex_tp: "KRX",
        stk_cd: symbol,
        ord_qty: String(qty),
        ord_uv: String(Math.round(price)),
        trde_tp: "0",  // 지정가
    };

    logger.info("live.loop.order.buy.attempt", { symbol, qty, price: Math.round(price) });

    const tr = await kiwoomTrPost(
        config,
        token.accessToken,
        config.kiwoomRestOrdrPath,
        config.kiwoomTrBuyId,
        body
    );

    const businessOk = isKiwoomTrBusinessOk(tr.json);
    const ok = tr.ok && businessOk;

    const rec = tr.json && typeof tr.json === "object" ? (tr.json as Record<string, unknown>) : {};
    const orderId = String(rec.ord_no ?? rec.order_no ?? "");

    logger.info("live.loop.order.buy.result", {
        symbol,
        ok,
        httpStatus: tr.httpStatus,
        orderId,
        broker: tr.json,
    });

    return { ok, orderId: orderId || undefined, message: ok ? "ok" : tr.message };
}

// -----------------------------------------------------------------
// 실전 매도 주문 전송 (SELL TR: kt10001)
// -----------------------------------------------------------------
async function sendSellOrder(
    config: AppConfig,
    symbol: string,
    qty: number,
    price: number,
    logger: Logger
): Promise<{ ok: boolean; message: string }> {
    const token = await fetchKiwoomAccessToken(config);
    if (!token.ok) {
        return { ok: false, message: `oauth_failed: ${token.message}` };
    }

    const body: Record<string, unknown> = {
        dmst_stex_tp: "KRX",
        stk_cd: symbol,
        ord_qty: String(qty),
        ord_uv: String(Math.round(price)),
        trde_tp: "0",  // 지정가
    };

    logger.info("live.loop.order.sell.attempt", { symbol, qty, price: Math.round(price) });

    // SELL TR ID: kt10001 (키움 매도 TR)
    const SELL_TR_ID = "kt10001";
    const tr = await kiwoomTrPost(
        config,
        token.accessToken,
        config.kiwoomRestOrdrPath,
        SELL_TR_ID,
        body
    );

    const ok = tr.ok && isKiwoomTrBusinessOk(tr.json);
    logger.info("live.loop.order.sell.result", { symbol, ok, httpStatus: tr.httpStatus, broker: tr.json });
    return { ok, message: ok ? "ok" : tr.message };
}

async function sendBuyOrderGuarded(
    config: AppConfig,
    symbol: string,
    qty: number,
    price: number,
    logger: Logger,
    accountResult: KiwoomAccountInfoResult
): Promise<{ ok: boolean; orderId?: string; message: string }> {
    const op = evaluateLiveOperationalOrderGate(config, { symbol, side: "BUY" });
    if (!op.ok) {
        logger.warn("live.loop.ops.blocked", {
            msg: op.reasonKoLine,
            reasons: op.reasons,
            symbol,
        });
        return { ok: false, message: op.reasonKoLine };
    }
    const requiredKrw = Math.round(price * qty);
    const fund = evaluateCashOnlyBuyFunding({
        accountFetchOk: accountResult.ok,
        accountSummary: accountResult.accountSummary,
        requiredKrw,
        accountCreditRisk: accountResult.accountSummary?.accountCreditRisk,
    });
    if (!fund.fundingGateOk) {
        logger.warn("live.loop.funding.blocked", {
            msg: fund.reasonKo,
            symbol,
            requiredKrw,
            cap: fund.noMarginOrderCapKrw,
        });
        return { ok: false, message: fund.reasonKo };
    }
    recordOrderAttempt();
    const r = await sendBuyOrder(config, symbol, qty, price, logger);
    recordOrderBrokerResult({ ok: r.ok, accepted: r.ok });
    return r;
}

async function sendSellOrderGuarded(
    config: AppConfig,
    symbol: string,
    qty: number,
    price: number,
    logger: Logger
): Promise<{ ok: boolean; message: string }> {
    recordOrderAttempt();
    const r = await sendSellOrder(config, symbol, qty, price, logger);
    recordOrderBrokerResult({ ok: r.ok, accepted: r.ok });
    return r;
}

// -----------------------------------------------------------------
// 청산 조건 판단
// -----------------------------------------------------------------
function evaluateExit(pos: LivePosition, currentPrice: number): string | null {
    const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

    // 손절
    if (pnlPct <= -LIVE_STOP_LOSS_PCT) return "stop_loss";

    // 익절
    if (pnlPct >= LIVE_TAKE_PROFIT_PCT) return "take_profit";

    // trailing stop: 고점 대비 하락
    const dropFromHigh = ((pos.highestPrice - currentPrice) / pos.highestPrice) * 100;
    if (pos.highestPrice > pos.entryPrice && dropFromHigh >= LIVE_TRAILING_STOP_PCT) {
        return "trailing_stop";
    }

    return null;
}

// -----------------------------------------------------------------
// 메인 루프 1 tick
// -----------------------------------------------------------------
async function runLiveOneTick(
    config: AppConfig,
    logger: Logger,
    tickIndex: number,
    universeSymbols: string[]
): Promise<void> {
    const now = clockNow();
    const { effectiveSessionPhase } = getEffectiveMarketSessionPhase(now, config.forceSessionPhase);
    const ordersPath = getOrdersJsonlPath(config.logsDir, now);

    // 미실현 손익 합산 (every tick)
    const totalUnrealizedPnl = getLivePositions().reduce((s, p) => s + p.unrealizedPnlKrw, 0);

    // ---
    // [2-a] 강제청산 판단 (장 마감 N분 전)
    // ---
    const forceExitEnabled = (process.env.LIVE_FORCE_EXIT_NEAR_CLOSE ?? "true").trim() !== "false";
    const forceExitMins = Number(process.env.LIVE_FORCE_EXIT_MINUTES ?? "10");
    const forceExitGate = evaluateLiveForceExit(now, {
        forceExitEnabled,
        forceExitMinutes: forceExitMins,
        sessionPhase: effectiveSessionPhase,
    });
    if (forceExitGate.shouldExit) {
        logger.warn("live.loop.force_exit", {
            reason: forceExitGate.reason,
            ...forceExitGate.context,
        });
    }

    const tickAccountResult = await fetchAccountInfo(logger, config);
    const tickAccountQueriedAt = new Date().toISOString();

    let fundingForMonitor = evaluateCashOnlyBuyFunding({
        accountFetchOk: tickAccountResult.ok,
        accountSummary: tickAccountResult.accountSummary,
        requiredKrw: 0,
        accountCreditRisk: tickAccountResult.accountSummary?.accountCreditRisk,
    });

    // ---
    // [0-b] 미체결 타임아웃 처리 (취소 API 미구현 — EXPIRED 전환으로 재진입 차단 해제)
    // ---
    const orderTimeoutMs = Number(process.env.LIVE_ORDER_TIMEOUT_MS ?? "300000"); // 기본 5분
    const timedOutOrders = findTimedOutOrders(now, orderTimeoutMs);
    for (const stale of timedOutOrders) {
        // 취소 요청을 아직 보내지 않은 경우에만 처리
        if (!markCancelRequested(stale.orderId)) continue; // 이미 요청됨

        // 키움 취소 API 미구현 → EXPIRED 로 전환해 re-entry 차단 해제
        // 다음 단계: kiwoomCancelOrder() 추가 후 CANCELLED 로 교체
        finalizeOrder(stale.orderId, "EXPIRED", now.toISOString());

        logger.warn("live.loop.order.expired", {
            orderId: stale.orderId,
            symbol: stale.symbol,
            side: stale.side,
            requestedQty: stale.requestedQty,
            filledQty: stale.filledQty,
            submittedAt: stale.submittedAt,
            ageMs: now.getTime() - new Date(stale.submittedAt).getTime(),
            msg: "미체결 주문 타임아웃 → EXPIRED 처리 (재진입 차단 해제)",
        });

        await appendOrderLog(ordersPath, {
            ts: now.toISOString(),
            type: "ORDER_EXPIRED",
            orderId: stale.orderId,
            symbol: stale.symbol,
            side: stale.side,
            requestedQty: stale.requestedQty,
            filledQty: stale.filledQty,
            submittedAt: stale.submittedAt,
            ageMs: now.getTime() - new Date(stale.submittedAt).getTime(),
            note: "cancel_api_not_implemented_yet",
        });
    }

    // ---
    // [1] 시세 조회 + 신호 생성
    // ---
    const records: SignalRecord[] = [];
    const quoteMap = new Map<string, { lastPrice: number; prevClose: number; turnover: number; name: string; status: string; upperLimit?: number | null }>();

    const heldSymbols = new Set(getLivePositions().map((p) => p.symbol));
    let quoteFetched = 0;
    let quoteSuccessN = 0;
    let quoteFailN = 0;
    let quoteSkippedBlocked = 0;

    for (const symbol of universeSymbols) {
        const skipForBlock = liveQuoteScanBlockedSymbols.has(symbol) && !heldSymbols.has(symbol);
        if (skipForBlock) {
            quoteSkippedBlocked += 1;
            continue;
        }

        try {
            quoteFetched += 1;
            const q = await fetchQuote(logger, config, symbol);
            if (q.ok && q.lastPrice != null) {
                liveQuoteScanBlockedSymbols.delete(symbol);
                quoteSuccessN += 1;

                const price = q.lastPrice;
                const prevClose = q.prevClose ?? 0;
                const turnover = q.turnover ?? 0;

                quoteMap.set(symbol, {
                    lastPrice: price,
                    prevClose,
                    turnover,
                    name: symbol,
                    status: "NORMAL",
                });

                const input: ScoringInput = {
                    price,
                    prevClose,
                    turnover,
                    isTradable: true,
                };
                const { score, reason } = evaluateScore(input);
                const candidate =
                    score >= config.signalCandidateMinScore && effectiveSessionPhase === "REGULAR";

                records.push({
                    candidate_at: now.toISOString(),
                    timestamp: now.toISOString(),
                    sessionPhase: effectiveSessionPhase,
                    symbol,
                    price,
                    turnover,
                    score,
                    reason,
                    candidate,
                    status: "CANDIDATE",
                    upperLimitPrice: null,
                    upperLimitHeadroomPct: null,
                });
            } else {
                quoteFailN += 1;
                if (
                    (q.failureKind === "parse" || q.failureKind === "tr") &&
                    !heldSymbols.has(symbol)
                ) {
                    liveQuoteScanBlockedSymbols.add(symbol);
                }
                logger.info("live.loop.quote.unavailable", {
                    symbol,
                    failureKind: q.failureKind,
                    message: q.message,
                });
            }
        } catch (e) {
            quoteFailN += 1;
            logger.warn("live.loop.quote.error", { symbol, error: String(e) });
            if (!heldSymbols.has(symbol)) {
                liveQuoteScanBlockedSymbols.add(symbol);
            }
        }
    }

    logger.info("live.loop.quote.scan", {
        tick: tickIndex,
        universeSize: universeSymbols.length,
        fetched: quoteFetched,
        success: quoteSuccessN,
        failed: quoteFailN,
        skippedBlocked: quoteSkippedBlocked,
        scanBlockedSymbols: [...liveQuoteScanBlockedSymbols].sort(),
    });

    // 신호 JSONL 저장
    if (records.length > 0) {
        const signalsPath = getSignalsJsonlPath(config.signalsDir, now, config.experimentTag);
        await appendSignalJsonlRecords(signalsPath, records).catch((e) => {
            logger.warn("live.loop.signals.write.error", { error: String(e) });
        });
    }

    // ---
    // [2] 보유 포지션 갱신 + 청산 판단 (force-exit 포함)
    // ---
    const openPositions = getLivePositions();
    for (const pos of openPositions) {
        const q = quoteMap.get(pos.symbol);
        if (!q) continue;

        updateLivePosition(pos.symbol, q.lastPrice, now.toISOString());

        // 전략 청산 사유 OR 강제청산 사유
        const exitReason = evaluateExit(pos, q.lastPrice) ?? (forceExitGate.shouldExit ? forceExitGate.reason : null);
        if (!exitReason) continue;

        // 정규장에서만 청산 주문
        if (effectiveSessionPhase !== "REGULAR") continue;

        logger.info("live.loop.exit.triggered", {
            symbol: pos.symbol,
            exitReason,
            currentPrice: q.lastPrice,
            entryPrice: pos.entryPrice,
            highestPrice: pos.highestPrice,
        });

        const sellResult = await sendSellOrderGuarded(config, pos.symbol, pos.qty, q.lastPrice, logger);

        await appendOrderLog(ordersPath, {
            ts: now.toISOString(),
            type: "SELL",
            symbol: pos.symbol,
            qty: pos.qty,
            price: q.lastPrice,
            exitReason,
            ok: sellResult.ok,
            message: sellResult.message,
        });

        if (sellResult.ok) {
            const closed = closeLivePosition(pos.symbol);
            if (closed) {
                const cost = computeKoreanPaperPnL({
                    entryPrice: closed.entryPrice,
                    exitPrice: q.lastPrice,
                    quantity: closed.qty,
                    feeBuyPct: config.kiwoomFeeBuyPct,
                    feeSellPct: config.kiwoomFeeSellPct,
                    taxSellPct: config.kiwoomTaxSellPct,
                    includeTax: config.paperIncludeTax,
                });

                _dailyRealizedPnlKrw += cost.finalNetPnlKrw;

                logger.info("live.loop.position.closed", {
                    symbol: pos.symbol,
                    exitReason,
                    exitPrice: q.lastPrice,
                    pnlKrw: cost.finalNetPnlKrw,
                    pnlPct: Number(cost.finalNetPnlPct.toFixed(4)),
                    dailyRealizedPnlKrw: _dailyRealizedPnlKrw,
                });

                recordSymbolFlat(pos.symbol, now.toISOString());
                syncDailyRealizedPnlKrw(_dailyRealizedPnlKrw);
                applyLossHaltIfNeeded(config.liveMaxDailyLossKrw);

                const tradesPath = getTradesJsonlPath(config.tradesDir, now, "live");
                await appendTradeJsonlRecord(tradesPath, {
                    candidate_at: closed.candidate_at,
                    entered_at: closed.entryAt,
                    exited_at: now.toISOString(),
                    openedAt: closed.entryAt,
                    closedAt: now.toISOString(),
                    symbol: closed.symbol,
                    entryPrice: closed.entryPrice,
                    exitPrice: q.lastPrice,
                    quantity: closed.qty,
                    entry_reason_code: closed.entryReasonCode,
                    exit_reason_code: exitReason,
                    mfe_pct: ((closed.highestPrice - closed.entryPrice) / closed.entryPrice) * 100,
                    mfe_krw: (closed.highestPrice - closed.entryPrice) * closed.qty,
                    mae_pct: ((closed.lowestPrice - closed.entryPrice) / closed.entryPrice) * 100,
                    mae_krw: (closed.lowestPrice - closed.entryPrice) * closed.qty,
                    pnlPct: cost.finalNetPnlPct,
                    pnlKrw: cost.finalNetPnlKrw,
                    grossPnlKrw: cost.grossPnlKrw,
                    feeBuyKrw: cost.feeBuyKrw,
                    feeSellKrw: cost.feeSellKrw,
                    taxSellKrw: cost.taxSellKrw,
                    netPnlAfterFeeKrw: cost.netPnlAfterFeeKrw,
                    finalNetPnlKrw: cost.finalNetPnlKrw,
                    closeReason: exitReason,
                    experimentTag: "live",
                });
            }
        }
    }

    // ---
    // [3] 신규 진입 판단 (session-guard 적용)
    // ---
    const entryGate = evaluateLiveEntryGate(now, {
        noEntryMinutes: Number(process.env.LIVE_NO_ENTRY_MINUTES ?? "15"),
        dailyLoss: {
            realizedPnlKrw: _dailyRealizedPnlKrw,
            unrealizedPnlKrw: totalUnrealizedPnl,
        },
        dailyLossLimitKrw: LIVE_DAILY_LOSS_LIMIT_KRW,
        sessionPhase: effectiveSessionPhase,
    });

    if (!entryGate.allowed) {
        logger.warn("live.loop.entry.blocked", {
            reason: entryGate.reason,
            ...entryGate.context,
        });
        await appendOrderLog(ordersPath, {
            ts: now.toISOString(),
            type: "ENTRY_BLOCKED",
            reason: entryGate.reason,
            ...entryGate.context,
        });
    }

    const canEnter =
        entryGate.allowed &&
        liveOpenCount() < LIVE_MAX_OPEN_POSITIONS &&
        !forceExitGate.shouldExit;

    if (canEnter && records.length > 0) {
        // pump-selector 필터 통과 종목만
        const liveQuotes = new Map<string, MarketQuote>();
        for (const [sym, q] of quoteMap.entries()) {
            liveQuotes.set(sym, {
                symbol: sym,
                name: q.name,
                lastPrice: q.lastPrice,
                prevClose: q.prevClose,
                turnover: q.turnover,
                status: "NORMAL",
                isEtfOrEtn: false,
            });
        }

        const sel = selectPumpEntryCandidates({
            records,
            quotes: liveQuotes,
            entryMinScore: LIVE_ENTRY_MIN_SCORE,
            entryMinTurnoverKrw: config.universeMinTurnoverKrw,
            maxEntriesThisTick: 1,
            openSymbols: new Set(getLivePositions().map((p) => p.symbol)),
            minHeadroomToUpperLimitPct: config.paperMinHeadroomToUpperLimitPct,
            maxChangeFromPrevClosePct: config.paperMaxChangeFromPrevClosePct,
            maxUpperWickRatioPct: config.paperMaxUpperWickRatioPct,
            usFilterEnabled: false, // live v1: US 필터 비활성 (mock 데이터만 있음)
            usRiskBlockMode: false,
            usRiskScorePenalty: 0,
            usRiskEvaluation: { isRiskOff: false, reasons: [] },
            globalRiskSnapshot: { nasdaqFuturesPct: 0, usdkrwChangePct: 0, kospi200FuturesPct: 0 },
            mondayFilterEnabled: false,
            mondayIsMonday: false,
            isMondayOpenBlockWindow: false,
            isMondayEarlyGapWindow: false,
            isMondayRegularSession: true,
            mondayGapStricterPct: 0,
            mondayExtraScorePenalty: 0,
            weekendRiskEval: { riskCount: 0, shouldBlock: false, shouldPenalize: false, reasons: [] },
            kiwoomFeeBuyPct: config.kiwoomFeeBuyPct,
            kiwoomFeeSellPct: config.kiwoomFeeSellPct,
            kiwoomTaxSellPct: config.kiwoomTaxSellPct,
            paperIncludeTax: config.paperIncludeTax,
            paperFillSlippagePct: 0,
            paperCostEdgeBufferPct: config.paperCostEdgeBufferPct,
            paperTakeProfitPct: LIVE_TAKE_PROFIT_PCT,
        });

        if (sel.picks.length > 0) {
            let maxRequiredKrw = 0;
            for (const pick of sel.picks) {
                const qx = quoteMap.get(pick.symbol);
                if (!qx) continue;
                const qQty = Math.max(1, Math.floor(LIVE_POSITION_SIZE_KRW / qx.lastPrice));
                maxRequiredKrw = Math.max(
                    maxRequiredKrw,
                    Math.round(qx.lastPrice * qQty)
                );
            }
            fundingForMonitor = evaluateCashOnlyBuyFunding({
                accountFetchOk: tickAccountResult.ok,
                accountSummary: tickAccountResult.accountSummary,
                requiredKrw: maxRequiredKrw,
                accountCreditRisk: tickAccountResult.accountSummary?.accountCreditRisk,
            });
        }

        for (const pick of sel.picks) {
            if (liveOpenCount() >= LIVE_MAX_OPEN_POSITIONS) break;
            if (hasLivePosition(pick.symbol)) continue;

            // 미체결 주문 존재 시 신규 진입 차단
            if (hasPendingOrderForSymbol(pick.symbol)) {
                logger.warn("live.loop.order.pending_exists", {
                    symbol: pick.symbol,
                    msg: "미체결 주문 있음 — 신규 진입 차단",
                });
                await appendOrderLog(ordersPath, {
                    ts: now.toISOString(),
                    type: "BUY_BLOCKED_PENDING",
                    symbol: pick.symbol,
                });
                continue;
            }

            // 중복 주문 방지: cooldown 체크
            const cooldownMs = Number(process.env.LIVE_ORDER_COOLDOWN_MS ?? "60000");
            if (isWithinOrderCooldown(pick.symbol, cooldownMs)) {
                logger.warn("live.loop.order.cooldown", {
                    symbol: pick.symbol,
                    cooldownMs,
                });
                await appendOrderLog(ordersPath, {
                    ts: now.toISOString(),
                    type: "BUY_BLOCKED_COOLDOWN",
                    symbol: pick.symbol,
                    cooldownMs,
                });
                continue;
            }

            const q = quoteMap.get(pick.symbol);
            if (!q) continue;

            const qty = Math.max(1, Math.floor(LIVE_POSITION_SIZE_KRW / q.lastPrice));
            const buyResult = await sendBuyOrderGuarded(
                config,
                pick.symbol,
                qty,
                q.lastPrice,
                logger,
                tickAccountResult
            );

            // 주문 전송 즉시 cooldown 등록 + order tracker 등록
            recordOrderTimestamp(pick.symbol);
            registerOrder({
                orderId: buyResult.orderId,
                symbol: pick.symbol,
                side: "BUY",
                requestedQty: qty,
                submittedAt: now.toISOString(),
            });

            await appendOrderLog(ordersPath, {
                ts: now.toISOString(),
                type: "BUY",
                symbol: pick.symbol,
                qty,
                price: q.lastPrice,
                score: pick.score,
                reason: pick.reason,
                ok: buyResult.ok,
                orderId: buyResult.orderId,
                message: buyResult.message,
            });

            if (buyResult.ok) {
                openLivePosition({
                    symbol: pick.symbol,
                    side: "BUY",
                    qty,
                    entryPrice: q.lastPrice,
                    entryNotionalKrw: q.lastPrice * qty,
                    entryAt: now.toISOString(),
                    candidate_at: pick.candidate_at,
                    entryReasonCode: pick.reason,
                    lastPrice: q.lastPrice,
                    unrealizedPnlKrw: 0,
                    updatedAt: now.toISOString(),
                    highestPrice: q.lastPrice,
                    lowestPrice: q.lastPrice,
                    orderId: buyResult.orderId,
                });
            }
        }
    }

    syncDailyRealizedPnlKrw(_dailyRealizedPnlKrw);
    applyLossHaltIfNeeded(config.liveMaxDailyLossKrw);

    // ---
    // [4] 대시보드 스냅샷 갱신
    // ---
    mergeMonitorSnapshot({
        accountRealFetchOk: tickAccountResult.ok,
        accountSummary: tickAccountResult.accountSummary,
        holdings: tickAccountResult.holdings ?? [],
        accountQueriedAt: tickAccountQueriedAt,
        liveOrderFunding: snapshotToPlain(fundingForMonitor),
        liveLoop: {
            tick: tickIndex,
            ts: now.toISOString(),
            sessionPhase: effectiveSessionPhase,
            openPositions: snapshotLivePositions(),
            dailyRealizedPnlKrw: _dailyRealizedPnlKrw,
            scanned: records.length,
            quoteScanBlockedSymbols: [...liveQuoteScanBlockedSymbols].sort(),
            quoteScanStats: {
                fetched: quoteFetched,
                success: quoteSuccessN,
                failed: quoteFailN,
                skippedBlocked: quoteSkippedBlocked,
            },
        },
    });

    logger.info("live.loop.tick", {
        tick: tickIndex,
        ts: now.toISOString(),
        sessionPhase: effectiveSessionPhase,
        scanned: records.length,
        openPositions: liveOpenCount(),
        dailyRealizedPnlKrw: _dailyRealizedPnlKrw,
    });
}

// -----------------------------------------------------------------
// 유니버스: 초기 버전은 고정 종목 리스트 (.env LIVE_UNIVERSE_SYMBOLS)
// -----------------------------------------------------------------
function resolveUniverseSymbols(config: AppConfig): string[] {
    const raw = (process.env.LIVE_UNIVERSE_SYMBOLS ?? "").trim();
    if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
    // 기본값: 삼성전자, SK하이닉스, LG에너지솔루션 (유동성 우수 대형주)
    return ["005930", "000660", "373220"];
}

// -----------------------------------------------------------------
// 루프 진입점
// -----------------------------------------------------------------
export async function startLiveLoop(config: AppConfig, logger: Logger): Promise<void> {
    const intervalMs = config.loopIntervalMs;
    const symbols = resolveUniverseSymbols(config);

    logger.info("live.loop.start", {
        msg: "live auto-trading loop starting",
        intervalMs,
        symbols,
        maxOpenPositions: LIVE_MAX_OPEN_POSITIONS,
        positionSizeKrw: LIVE_POSITION_SIZE_KRW,
        stopLossPct: LIVE_STOP_LOSS_PCT,
        takeProfitPct: LIVE_TAKE_PROFIT_PCT,
        trailingStopPct: LIVE_TRAILING_STOP_PCT,
        dailyLossLimitKrw: LIVE_DAILY_LOSS_LIMIT_KRW,
        entryMinScore: LIVE_ENTRY_MIN_SCORE,
    });

    let tickIndex = 0;
    let running = false;

    const run = async (): Promise<void> => {
        if (running) return;
        running = true;
        try {
            tickIndex += 1;
            await runLiveOneTick(config, logger, tickIndex, symbols);
        } catch (e) {
            logger.error("live.loop.tick.error", { tick: tickIndex, error: String(e) });
            // tick 실패 시 루프는 계속 유지
        } finally {
            running = false;
        }
    };

    // 첫 tick 즉시 실행 후 인터벌 시작
    await run();

    const timer = setInterval(() => {
        void run();
    }, intervalMs);

    const shutdown = (): void => {
        clearInterval(timer);
        logger.info("live.loop.shutdown", {
            msg: "live loop stopped",
            totalTicks: tickIndex,
            dailyRealizedPnlKrw: _dailyRealizedPnlKrw,
        });
        process.exit(0);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    // 루프는 SIGINT/SIGTERM 까지 실행 유지 (await done 패턴 없이 process 유지)
    await new Promise<void>(() => { /* 의도적 무한 대기 */ });
}
