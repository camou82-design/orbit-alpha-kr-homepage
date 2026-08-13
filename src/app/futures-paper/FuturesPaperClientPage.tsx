"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

import {
    formatChanged,
    formatCount,
    formatCurrencyUsd,
    formatDateTimeKst,
    formatDateTimeKstShort,
    formatDateTimeKstNumeric,
    formatTimeHmssKst,
    formatPercent,
    formatPrice,
    describeSnapshotContext,
    mapReasonLabel,
    mapSignalLabel,
    mapStatusLabel,
    interpretPerformance,
    formatExitReason,
    computeLedgerPerformanceFromHistory,
    INITIAL_CAPITAL_KRW,
    USDKRW_RATE,
    INITIAL_CAPITAL_USD,
    pickNoEntryAuditRow,
    isStaleNoEntryAudit,
    noEntryJudgmentTsMs,
    maxSymbolAuditTs,
    mapNoEntryExpectedMissing,
    mapNoEntryNextAction,
    noEntryExpectedMissingRawForDetail,
    noEntryNextActionRawForDetail,
    mapHtfEntryPolicy,
    htfEntryPolicyRawForDetail,
    mapMacroSourceDisplay,
    formatHtfBiasField,
    formatHtfSizeMultiplier,
    noEntryRowHasHtf,
    formatSideCandidateEn,
    formatBoolKo,
    formatEmpty,
    formatRelativeAgeKo,
    NO_ENTRY_AUDIT_STALE_MS
} from "@/lib/futuresPaperFormat";

/** Types */
type LedgerWindow = {
    totalTrades: number;
    winRate: number;
    totalPnlUsdNet: number;
    totalPnlUsdGross: number;
    totalFeeUsd: number;
    totalFundingUsd: number;
};

type LedgerPerformance = {
    generatedAt: number;
    parsedTradeCount: number;
    all: LedgerWindow;
    last7d: LedgerWindow;
    last30d: LedgerWindow;
    monthToDate: LedgerWindow;
};

type Bundle = {
    configured: boolean;
    configHint: string | null;
    summary: Record<string, unknown> | null;
    summaryRange?: Record<string, unknown> | null;
    summaryTrend?: Record<string, unknown> | null;
    summaryWindow: Record<string, unknown> | null;
    summaryHealth: Record<string, unknown> | null;
    dashboard: Record<string, unknown> | null;
    engineState?: Record<string, unknown> | null;
    symbolRows: Array<Record<string, unknown>>;
    healthHistoryRecent: Array<Record<string, unknown>>;
    ledgerPerformance: LedgerPerformance | null;
    openPositions?: Array<Record<string, unknown>>;
    currentPositions?: Array<Record<string, unknown>>;
    eventsRecent?: Array<Record<string, unknown>>;
    positionsHistory?: Array<Record<string, any>>;
    // Control states
    serverTradeEnabled?: boolean;
    closeOnlyMode?: boolean;
    killSwitch?: boolean;
    trade_control_updated_at?: number;
    trade_control_source?: string;
    paperOperational?: Record<string, unknown>;
    /** Bundle assembly time (epoch ms); not the same as V2 judgment `ts`. */
    generatedAt?: number;
    noEntryAudit?: Record<string, unknown> | null;
    noEntryAuditBySymbol?: Readonly<Record<string, Record<string, unknown>>> | null;
};

type NormPos = {
    /** Contract / position notional (USD), from `sizeUsd`. */
    notionalUsd: number | null;
    /** Collateral (USD): `marginUsd` when present, else `notionalUsd / leverage`. */
    marginUsd: number | null;
    leverage: number;
    entryPrice: number | null;
    openedAt: number | null;
    realized: number;
    stopPx: number | null;
    engineUnreal: number | null;
    unrealPct: number | null;
    raw: Record<string, unknown>;
};

/** Utils */
function num(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pick<T = unknown>(obj: unknown, keys: string[]): T | null {
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    for (const k of keys) {
        if (k in o) return o[k] as T;
    }
    return null;
}

function topNCounts(obj: unknown, n: number): Array<{ key: string; value: number }> {
    if (!obj || typeof obj !== "object") return [];
    const entries = Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
        .map(([k, v]) => ({ key: k, value: v as number }))
        .sort((a, b) => b.value - a.value);
    return entries.slice(0, Math.max(0, n));
}

function coerceFinite(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
        const x = parseFloat(String(v).replace(/,/g, ""));
        if (Number.isFinite(x)) return x;
    }
    return null;
}

function entryNotionalUsd(pos: Record<string, unknown>): number | null {
    const n = coerceFinite(pos.sizeUsd);
    if (n !== null && n > 0) return n;
    return null;
}

function entryMarginUsd(pos: Record<string, unknown>): number | null {
    const direct = coerceFinite(pick(pos, ["marginUsd", "margin_usd"]));
    if (direct !== null && direct > 0) return direct;
    const notional = entryNotionalUsd(pos);
    const lev = coerceFinite(pos.leverage) ?? 1;
    if (notional !== null && notional > 0 && lev > 0) return notional / lev;
    const leg = coerceFinite(pos.initialSizeUsd);
    if (leg !== null && leg > 0) return leg;
    return null;
}

function normalizeOpenPos(pos: Record<string, unknown>): NormPos | null {
    if (!pos || typeof pos !== "object") return null;
    const opened =
        coerceFinite(pos.openedAt) ?? coerceFinite(pos.firstOpenedAt);
    return {
        notionalUsd: entryNotionalUsd(pos),
        marginUsd: entryMarginUsd(pos),
        leverage: coerceFinite(pos.leverage) ?? 1,
        entryPrice: coerceFinite(pos.entryPrice),
        openedAt: opened,
        realized: coerceFinite(pos.realizedPnl) ?? 0,
        stopPx: coerceFinite(pos.stopPrice),
        engineUnreal: coerceFinite(pos.unrealizedPnl),
        unrealPct: coerceFinite(pos.unrealizedPnlPct),
        raw: pos
    };
}

function closedTradeMarginUsd(t: Record<string, unknown>): number | null {
    const m = coerceFinite(pick(t, ["marginUsd", "margin_usd"]));
    if (m !== null && m > 0) return m;
    const sz = coerceFinite(t.sizeUsd);
    const lev = coerceFinite(t.leverage) ?? 1;
    if (sz !== null && sz > 0 && lev > 0) return sz / lev;
    const ini = coerceFinite(t.initialSizeUsd);
    if (ini !== null && ini > 0) return ini;
    return null;
}

function markForPosition(
    pos: Record<string, unknown>,
    row: Record<string, unknown> | undefined,
    dec?: Record<string, unknown> | null
): number | null {
    const lp = row ? coerceFinite(row.lastPrice) : null;
    if (lp !== null) return lp;
    const dm = dec ? coerceFinite(dec.mark) : null;
    if (dm !== null) return dm;
    return coerceFinite(pos.currentPrice);
}

function unrealizedUsdResolved(n: NormPos, mark: number | null): number | null {
    const pos = n.raw;
    const side = pos.side === "short" ? "short" : "long";
    if (n.engineUnreal !== null && Number.isFinite(n.engineUnreal)) return n.engineUnreal;
    if (n.unrealPct !== null && n.marginUsd !== null && n.marginUsd > 0) return (n.marginUsd * n.unrealPct) / 100;
    if (
        mark === null ||
        n.entryPrice === null ||
        n.entryPrice <= 0 ||
        n.marginUsd === null ||
        n.marginUsd <= 0
    )
        return null;
    const lev = n.leverage;
    const gross =
        side === "long"
            ? ((mark - n.entryPrice) / n.entryPrice) * n.marginUsd * lev
            : ((n.entryPrice - mark) / n.entryPrice) * n.marginUsd * lev;
    return Number.isFinite(gross) ? gross : null;
}

function formatSignedUsdDisplay(v: number | null, empty = "기록 없음"): string {
    if (v === null || !Number.isFinite(v)) return empty;
    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
    const body = formatCurrencyUsd(Math.abs(v), empty);
    if (body === empty) return empty;
    return sign + body;
}

function formatPctOnMargin(pnlUsd: number | null, marginUsd: number | null): string {
    if (pnlUsd === null || !Number.isFinite(pnlUsd)) return "기록 없음";
    if (marginUsd === null || !Number.isFinite(marginUsd) || marginUsd <= 0) return "기록 없음";
    const pct = (pnlUsd / marginUsd) * 100;
    const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
    return sign + Math.abs(pct).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) + "%";
}

function formatHoldShort(openedAtMs: number | null): string {
    if (openedAtMs === null || !Number.isFinite(openedAtMs)) return "기록 없음";
    const ms = Date.now() - openedAtMs;
    if (ms < 0) return "기록 없음";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}일 ${h % 24}시간`;
    if (h > 0) return `${h}시간 ${m % 60}분`;
    if (m > 0) return `${m}분`;
    return `${s}초`;
}

type PositionDisplaySlot = Readonly<{
    pos: Record<string, unknown>;
    exchangeDiagnosticBadge: string | null;
    exchangeStatusHeadline: string | null;
    manualInterventionSuspected: boolean;
    manualInterventionReasons: string[];
    syncMismatchDetected: boolean;
    syncMismatchReasons: string[];
    /** OKX 실제 포지션 (okx_positions_preview 행) */
    okxActual: Record<string, unknown> | null;
}>;

function positionRowKey(symbol: string, side: string): string {
    const sd = String(side).toLowerCase() === "short" ? "short" : "long";
    return `${String(symbol)}:${sd}`;
}

/**
 * 1) Paper ledger openPositions
 * 2) engineState.ledger_okx_position_sync.okx_positions_preview (원장 비었을 때)
 * 3) engineState.position_ops_surface.rows (미중복 보강)
 */
/**
 * Helper to extract definitive current positions from bundle
 */
function getActivePositions(bundle: Bundle): { positions: Array<Record<string, any>>, isFallback: boolean } {
    const engine = bundle.engineState && typeof bundle.engineState === "object"
        ? (bundle.engineState as Record<string, any>)
        : null;
    const sync = engine?.ledger_okx_position_sync as Record<string, any> | undefined | null;
    const syncStatus = typeof sync?.sync_status === "string" ? sync.sync_status : "";
    const okxPreview = Array.isArray(sync?.okx_positions_preview) 
        ? (sync.okx_positions_preview as Record<string, any>[]) 
        : [];

    let authoritativeRaw: any[] = [];
    let isFallback = false;

    if (Array.isArray(bundle.currentPositions)) {
        authoritativeRaw = bundle.currentPositions;
    } else {
        authoritativeRaw = Array.isArray(bundle.openPositions) ? bundle.openPositions : [];
        isFallback = true;
    }

    const ledgerOpen = authoritativeRaw.filter((p) => p && (p.status === undefined || String(p.status) === "open"));

    // Rule 3 & 4: Mismatch 상황이면 OKX에 실존하지 않는 원장 row 제거
    const problematicSync = [
        "KEY_MISMATCH", "LEDGER_ONLY", "OKX_ONLY", "SIZE_MISMATCH", "NOTIONAL_MISMATCH"
    ].includes(syncStatus);

    if (problematicSync) {
        return {
            positions: ledgerOpen.filter(p => {
                const sym = String(p.symbol || "");
                const side = String(p.side || "long").toLowerCase();
                // OKX 프리뷰에 존재하는지 확인
                return okxPreview.some(o => 
                    String(o.symbol) === sym && 
                    String(o.side).toLowerCase() === side
                );
            }),
            isFallback
        };
    }

    return { positions: ledgerOpen, isFallback };
}

function getDiagnosticLedgerPositions(bundle: Bundle): Array<Record<string, any>> {
    let authoritativeRaw: any[] = [];
    if (Array.isArray(bundle.currentPositions)) {
        authoritativeRaw = bundle.currentPositions;
    } else {
        authoritativeRaw = Array.isArray(bundle.openPositions) ? bundle.openPositions : [];
    }
    return authoritativeRaw.filter((p) => p && (p.status === undefined || String(p.status) === "open"));
}

/**
 * OKX preview row + 현재가(mark)로 추정 미실현 손익 계산
 * upl 필드 없을 때 사용. 반드시 "(추정)" 레이블 부착 필요.
 */
function estimateOkxPnl(
    okx: Record<string, unknown>,
    markFallback: number | null
): { pnl: number | null; pct: number | null; isEstimated: boolean } {
    const upl = coerceFinite(okx.upl) ?? coerceFinite(okx.unrealizedPnl);
    const uplRatio = coerceFinite(okx.uplRatio) ?? coerceFinite(okx.unrealizedPnlPct);
    if (upl !== null) return { pnl: upl, pct: uplRatio, isEstimated: false };

    const avgPx = coerceFinite(okx.avgPx) ?? coerceFinite(okx.avg_px);
    const baseQty = coerceFinite(okx.baseQty);
    const mark = coerceFinite(okx.markPx) ?? coerceFinite(okx.mark_px) ?? markFallback;
    const notional = coerceFinite(okx.notionalUsd);
    const sideStr = String(okx.side ?? okx.posSide ?? "long").toLowerCase();

    if (avgPx !== null && mark !== null && avgPx > 0) {
        // baseQty 있으면 BTC × 가격차, 없으면 notional 기준
        let pnl: number | null = null;
        if (baseQty !== null && baseQty > 0) {
            pnl = sideStr === "short"
                ? (avgPx - mark) * baseQty
                : (mark - avgPx) * baseQty;
        } else if (notional !== null && notional > 0) {
            const ratio = sideStr === "short"
                ? (avgPx - mark) / avgPx
                : (mark - avgPx) / avgPx;
            pnl = notional * ratio;
        }
        if (pnl !== null && Number.isFinite(pnl)) {
            const pct = notional && notional > 0 ? pnl / notional : null;
            return { pnl, pct, isEstimated: true };
        }
    }
    return { pnl: null, pct: null, isEstimated: true };
}

/**
 * 수동 개입 감지 판정 (5조건)
 * 조건 중 하나라도 해당하면 manualInterventionSuspected = true
 */
function hasExplicitIndependentManualEvidenceForDisplay(pos: Record<string, unknown>): boolean {
    if (!pos) return false;

    // 1. EXTERNAL_MANUAL_POSITION / OPERATOR_MANAGED 무조건 true (independent=false여도 true)
    const ls = String(pos.lifecycleState || "");
    if (ls === "EXTERNAL_MANUAL_POSITION" || ls === "OPERATOR_MANAGED") return true;

    // 2. manualLifecycleEvidenceIndependent === true 무조건 true
    if (pos.manualLifecycleEvidenceIndependent === true) return true;

    // 3. 그 다음 independent === false 이면 파생 상태(latch, EXTERNAL_MANUAL_MANAGED 등)는 차단
    if (pos.manualLifecycleEvidenceIndependent === false) return false;

    // 4. STRONG latch + 명시적 source 확인
    if (pos.manualOwnershipLatch === true && String(pos.manualOwnershipLatchStrength || "") === "STRONG") {
       if (String(pos.authoritySourceAtEntry || "") === "EXPLICIT_EXTERNAL_FILL") return true;
    }

    return false;
}

function detectPositionSyncMismatch(
    ledgerPos: Record<string, unknown>,
    sync: Record<string, unknown> | null | undefined,
    isFallbackSlot: boolean
): { suspected: boolean; reasons: string[] } {
    const reasons: string[] = [];

    const syncStatus = typeof sync?.sync_status === "string" ? sync.sync_status : "";
    const preview = Array.isArray(sync?.okx_positions_preview)
        ? (sync!.okx_positions_preview as Record<string, unknown>[])
        : [];

    const sym = String(ledgerPos.symbol ?? "");
    const ledgerSide = String(ledgerPos.side ?? "long").toLowerCase();

    // 심볼 매칭: OKX는 "BTC-USDT-SWAP" 또는 "BTCUSDT", posSide/net 처리
    const symCore = sym.replace(/-USDT-SWAP$/i, "").replace(/USDT$/i, "").toUpperCase();
    
    // okxSymbolRow: 해당 심볼의 어떤 행이든 먼저 찾음
    const okxSymbolRows = preview.filter((o) => {
        const oSym = String(o.symbol ?? "").replace(/-USDT-SWAP$/i, "").replace(/USDT$/i, "").toUpperCase();
        return oSym === symCore;
    });
    
    // okxSameSideRow: 방향이 같은 행 찾음 (net 포함)
    const okxSameSideRow = okxSymbolRows.find((o) => {
        const oSide = String(o.side ?? o.posSide ?? "net").toLowerCase();
        if (oSide === "net") return true;
        return oSide === ledgerSide;
    });

    // 조건 1: sync_status 불일치
    if (["SIZE_MISMATCH", "NOTIONAL_MISMATCH", "KEY_MISMATCH"].includes(syncStatus)) {
        reasons.push(`OKX 수량·방향 불일치 (${syncStatus})`);
    }
    
    // 사이즈 비교는 same-side가 있을 때만
    if (okxSameSideRow) {
        const ledgerSz = coerceFinite(ledgerPos.sizeUsd) ?? coerceFinite(ledgerPos.sizeContracts);
        const okxSz = coerceFinite(okxSameSideRow.pos) ?? coerceFinite(okxSameSideRow.notional);
        if (ledgerSz !== null && okxSz !== null && Math.abs(ledgerSz - okxSz) / Math.max(Math.abs(ledgerSz), 1) > 0.05) {
            reasons.push(`레저/OKX 수량 편차 ${((Math.abs(ledgerSz - okxSz) / Math.abs(ledgerSz)) * 100).toFixed(1)}%`);
        }
    }

    // 조건 2: OKX_ONLY
    if (syncStatus === "OKX_ONLY") {
        reasons.push("OKX에만 포지션 존재 (엔진 원장 누락)");
    }

    // 조건 3: 폴백 소스
    if (isFallbackSlot) {
        reasons.push("OKX preview/ops_surface 폴백 소스 사용 중 (원장 미연동)");
    }
    if (ledgerPos._orb_exchange_only === true) {
        reasons.push("원장에 없는 OKX 전용 포지션");
    }

    // 조건 4: 자동 진입가 vs OKX avgPx 5% 초과 (same-side 기준)
    const autoReasons = ["paper_long_candidate", "paper_short_candidate", "v2_", "CORE_", "SURGE_", "PROBE_"];
    const entryReason = String(ledgerPos.entryReason ?? ledgerPos.sourceSignal ?? "");
    const isAutoEntry = entryReason === "" || autoReasons.some((r) => entryReason.includes(r));
    if (isAutoEntry && okxSameSideRow) {
        const ledgerPx = coerceFinite(ledgerPos.entryPrice);
        const okxAvg = coerceFinite(okxSameSideRow.avgPx ?? okxSameSideRow.avg_px ?? okxSameSideRow.reference_entry_px);
        if (ledgerPx !== null && okxAvg !== null && ledgerPx > 0) {
            const diff = Math.abs(ledgerPx - okxAvg) / ledgerPx;
            if (diff > 0.05) {
                reasons.push(`자동 진입가(${ledgerPx.toFixed(1)}) vs OKX avgPx(${okxAvg.toFixed(1)}) ${(diff * 100).toFixed(1)}% 차이`);
            }
        }
    }

    // 조건 5: LEDGER_ONLY
    if (syncStatus === "LEDGER_ONLY") {
        reasons.push("원장에만 포지션 존재 (OKX 실제 미보유 가능성)");
    }

    // 조건 6: OKX preview에 해당 심볼 행이 존재하면서 수량/avgPx가 다를 때
    // sync_status가 ALIGNED여도 OKX 행 데이터가 실제 다른 경우 표시 (same-side 기준)
    if (okxSameSideRow && reasons.length === 0) {
        const ledgerPx = coerceFinite(ledgerPos.entryPrice);
        const okxAvg = coerceFinite(okxSameSideRow.avgPx ?? okxSameSideRow.avg_px);
        const ledgerSz2 = coerceFinite(ledgerPos.sizeContracts) ?? coerceFinite(ledgerPos.sizeUsd);
        const okxSz2 = coerceFinite(okxSameSideRow.pos) ?? coerceFinite(okxSameSideRow.sz);
        if (ledgerPx !== null && okxAvg !== null && ledgerPx > 0) {
            const diff = Math.abs(ledgerPx - okxAvg) / ledgerPx;
            if (diff > 0.01) {
                reasons.push(`진입가 불일치: 레저 ${ledgerPx.toFixed(1)} / OKX ${okxAvg.toFixed(1)} (${(diff * 100).toFixed(1)}%)`);
            }
        }
        if (ledgerSz2 !== null && okxSz2 !== null && Math.abs(ledgerSz2 - okxSz2) / Math.max(Math.abs(ledgerSz2), 1) > 0.01) {
            reasons.push(`수량 불일치: 레저 ${ledgerSz2} / OKX ${okxSz2}`);
        }
    }

    // 조건 7: 방향 불일치 (okxSymbolRow는 있으나 okxSameSideRow가 없는 경우)
    if (okxSymbolRows.length > 0 && !okxSameSideRow) {
        const actualOkxSide = String(okxSymbolRows[0].side ?? okxSymbolRows[0].posSide ?? "").toLowerCase();
        reasons.push(`방향 불일치 (OKX actual: ${actualOkxSide.toUpperCase()} / Engine: ${ledgerSide.toUpperCase()})`);
    }

    return { suspected: reasons.length > 0, reasons };
}


/**
 * 전용 뷰 데이터를 구성하는 함수
 * 1) getActivePositions (currentPositions 우선, openPositions fallback/필터)
 * 2) 원장 비었을 때 OKX 전용 포지션 보강 (okx_positions_preview / ops_surface)
 */
function buildPositionDisplaySlots(bundle: Bundle): PositionDisplaySlot[] {
    const engine =
        bundle.engineState && typeof bundle.engineState === "object"
            ? (bundle.engineState as Record<string, unknown>)
            : null;
    const sync = engine?.ledger_okx_position_sync as Record<string, unknown> | undefined | null;
    const ops = engine?.position_ops_surface as Record<string, unknown> | undefined | null;
    const syncStatus = typeof sync?.sync_status === "string" ? sync.sync_status : "";

    const { positions: activePositions } = getActivePositions(bundle);
    const diagnosticPositions = getDiagnosticLedgerPositions(bundle);
    
    const positionMap = new Map<string, Record<string, any>>();
    for (const p of candidatePositions) {
        const sym = String(p.symbol || "");
        const side = String(p.side || "long").toLowerCase();
        positionMap.set(`${sym}:${side}`, p);
    }
    for (const p of diagnosticPositions) {
        const sym = String(p.symbol || "");
        const side = String(p.side || "long").toLowerCase();
        if (!positionMap.has(`${sym}:${side}`)) {
            positionMap.set(`${sym}:${side}`, p);
        }
    }
    const candidatePositions = Array.from(positionMap.values());

    const reconcileBadge =
        syncStatus === "OKX_ONLY" ||
        syncStatus === "KEY_MISMATCH" ||
        syncStatus === "LEDGER_ONLY" ||
        syncStatus === "REMOTE_UNAVAILABLE" ||
        syncStatus === "SIZE_MISMATCH" ||
        syncStatus === "NOTIONAL_MISMATCH"
            ? `리컨실 ${syncStatus}`
            : null;

    const slots: PositionDisplaySlot[] = [];
    const seenKeys = new Set<string>();

    // OKX preview 참조 (detectManualIntervention에서도 사용)
    const preview = Array.isArray(sync?.okx_positions_preview)
        ? (sync!.okx_positions_preview as Record<string, unknown>[])
        : [];

    for (const p of activePositions) {
        const sym = String(p.symbol || "");
        const side = String(p.side || "long").toLowerCase();
        seenKeys.add(positionRowKey(sym, side));

        const trueExternalManual = hasExplicitIndependentManualEvidenceForDisplay(p);
        const { suspected, reasons } = detectPositionSyncMismatch(p, sync as Record<string, unknown> | null, false);

        // OKX preview 행 매칭: symbol + side/posSide 기준
        const symCore = sym.replace(/-USDT-SWAP$/i, "").replace(/USDT$/i, "").toUpperCase();
        
        const okxSymbolRows = preview.filter((o) => {
            const oSym = String(o.symbol ?? "").replace(/-USDT-SWAP$/i, "").replace(/USDT$/i, "").toUpperCase();
            return oSym === symCore;
        });

        // same-side 우선 매칭, 없으면 다른 side라도 반환하여 okxActual에 바인딩
        const okxActual = okxSymbolRows.find((o) => {
            const oSide = String(o.side ?? o.posSide ?? "net").toLowerCase();
            if (oSide === "net") return true;
            return oSide === side;
        }) ?? okxSymbolRows[0] ?? null;

        const sideMismatch = okxActual && String(okxActual.side ?? okxActual.posSide ?? "").toLowerCase() !== "net" && String(okxActual.side ?? okxActual.posSide ?? "").toLowerCase() !== side;
        
        let diagnosticBadge = reconcileBadge;
        if (sideMismatch) {
            diagnosticBadge = `포지션 동기화 불일치 · OKX actual 기준 감시 중`;
        } else if (trueExternalManual) {
            diagnosticBadge = `외부 수동 개입 확인`;
        } else if (suspected) {
            diagnosticBadge = `포지션 동기화 불일치 · ${reasons[0] ?? syncStatus}`;
        }

        slots.push({
            pos: p,
            exchangeDiagnosticBadge: diagnosticBadge,
            exchangeStatusHeadline: null,
            manualInterventionSuspected: trueExternalManual,
            manualInterventionReasons: trueExternalManual ? [String(p.reconcileState || p.ledgerSyncStatus || "EXTERNAL_MANUAL")] : [],
            syncMismatchDetected: suspected,
            syncMismatchReasons: reasons,
            okxActual
        });
    }

    // 원장에 없는 OKX ONLY 포지션 보강 (preview는 위에서 이미 선언됨)
    const opsRows = Array.isArray(ops?.rows) ? (ops.rows as Record<string, unknown>[]) : [];

    const findOpsRow = (symbol: string, side: string) =>
        opsRows.find(
            (r) =>
                String(r.symbol) === symbol &&
                String(r.side).toLowerCase() === String(side).toLowerCase()
        );

    for (const row of preview) {
        const symbol = String(row.symbol ?? "");
        const side = String(row.side ?? "long").toLowerCase() === "short" ? "short" : "long";
        const key = positionRowKey(symbol, side);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        const op = findOpsRow(symbol, side);
        const entryPx = coerceFinite(op?.reference_entry_px) ?? coerceFinite(op?.okx_avg_px) ?? null;
        const stopPx = coerceFinite(op?.ledger_stop_px) ?? coerceFinite(op?.initial_stop_px_engine_mirror) ?? null;
        const contracts = coerceFinite(row.pos);

        const fallbackPos = {
            symbol,
            side,
            ...(entryPx !== null ? { entryPrice: entryPx } : {}),
            ...(stopPx !== null ? { stopPrice: stopPx } : {}),
            leverage: 10,
            status: "open",
            _orb_exchange_only: true,
            ...(contracts !== null ? { _orb_contracts: contracts } : {})
        };
        const fbTrueExternalManual = hasExplicitIndependentManualEvidenceForDisplay(fallbackPos);
        const { suspected: fbSuspected, reasons: fbReasons } = detectPositionSyncMismatch(
            fallbackPos, sync as Record<string, unknown> | null, true
        );
        
        let fbDiagnosticBadge = syncStatus === "OKX_ONLY" ? "Paper 원장 미동기화 · OKX_ONLY" : `실거래소 포지션 · ${syncStatus || "ALIGNED"}`;
        if (fbTrueExternalManual) {
            fbDiagnosticBadge = `외부 수동 개입 확인`;
        } else if (fbSuspected) {
            fbDiagnosticBadge = `포지션 동기화 불일치 · ${fbReasons[0] ?? syncStatus}`;
        }
        
        slots.push({
            pos: fallbackPos,
            exchangeDiagnosticBadge: fbDiagnosticBadge,
            exchangeStatusHeadline: fbTrueExternalManual ? "외부 수동 개입 확인" : fbSuspected ? "장부 정합성 확인 필요" : "실거래소 포지션 보유 중",
            manualInterventionSuspected: fbTrueExternalManual,
            manualInterventionReasons: fbTrueExternalManual ? [String(fallbackPos.reconcileState || fallbackPos.ledgerSyncStatus || "EXTERNAL_MANUAL")] : [],
            syncMismatchDetected: fbSuspected,
            syncMismatchReasons: fbReasons,
            okxActual: row as Record<string, unknown>
        });
    }

    return slots;
}

function aggregatePortfolioMetricsFromBundle(bundle: Bundle) {
    const { positions: activePositions } = getActivePositions(bundle);
    const eng = bundle.engineState;
    const symDec =
        eng && typeof eng === "object"
            ? ((eng as Record<string, unknown>).symbol_decisions as
                | Record<string, { decision?: Record<string, unknown> }>
                | undefined)
            : undefined;
    
    let totalUnreal = 0;
    for (const o of activePositions) {
        const n = normalizeOpenPos(o as Record<string, unknown>);
        if (!n) continue;
        const sym = String((o as Record<string, unknown>).symbol ?? "");
        const row = bundle.symbolRows?.find((r) => String(r.symbol) === sym);
        const dec = symDec?.[sym]?.decision;
        const mark = markForPosition(o as Record<string, unknown>, row, dec ?? null);
        const u = unrealizedUsdResolved(n, mark);
        if (typeof u === "number" && Number.isFinite(u)) totalUnreal += u;
    }
    return { openCount: activePositions.length, totalUnreal };
}

const SYMBOL_ORDER = ["BTCUSDT", "ETHUSDT"];

function formatKrw(v: number): string {
    return "₩" + v.toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatUsdSignified(v: number | null): string {
    if (v === null || !Number.isFinite(v)) return "$0.00";
    return (v >= 0 ? "+" : "−") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toMainKrwSubUsd(usd: number, rate: number) {
    return {
        krw: formatKrw(usd * rate),
        usd: `약 $${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    };
}

function toSignedMainKrwSubUsd(usd: number, rate: number) {
    const sign = usd > 0 ? "+" : usd < 0 ? "-" : "";
    const abs = Math.abs(usd);
    return {
        krw: `${sign}${formatKrw(abs * rate)}`,
        usd: `약 ${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    };
}

function getPaperOperational(bundle: Bundle): Record<string, unknown> | null {
    const top = bundle.paperOperational;
    if (top && typeof top === "object") return top;
    const dash = bundle.dashboard;
    if (dash && typeof dash === "object") {
        const nested = (dash as Record<string, unknown>).paperOperational;
        if (nested && typeof nested === "object") return nested as Record<string, unknown>;
    }
    return null;
}

/** Components */

function HeroMetric({
    label,
    value,
    subValue,
    smallSubValue,
    valueClass
}: {
    label: string;
    value: string;
    subValue?: string;
    smallSubValue?: string;
    valueClass?: string;
}) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
            <div>
                <p className={`text-2xl font-black tabular-nums tracking-tighter sm:text-3xl ${valueClass ?? "text-slate-900"}`}>
                    {value}
                </p>
                {subValue && <p className="mt-1 text-[11px] font-bold text-slate-400">{subValue}</p>}
                {smallSubValue && <p className="mt-0.5 text-[9px] font-medium text-slate-300">{smallSubValue}</p>}
            </div>
            <p className="mt-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-300">{label}</p>
        </div>
    );
}


function MetricCell({
    label,
    value,
    valueClass,
    className
}: {
    label: string;
    value: string;
    valueClass?: string;
    className?: string;
}) {
    return (
        <div className={`rounded-lg border border-slate-100 bg-slate-50/30 p-4 transition-all hover:bg-slate-50 ${className || ""}`}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className={`mt-2 font-mono text-sm font-black tracking-tight ${valueClass || "text-slate-700"}`}>
                {value}
            </p>
        </div>
    );
}


type SymbolDecisionSummary = {
    authority_decision?: string | null;
    authority_side?: string | null;
    adopted_engine?: string | null;
    adoption_reason?: string | null;
    v1_decision?: string | null;
    v1_side?: string | null;
    v2_decision?: string | null;
    v2_side?: string | null;
    selector_mismatch?: boolean | null;
};

type SymbolStatusDisplay = {
    label: string;
    reason: string;
};

function buildSymbolStatusDisplay(decision?: SymbolDecisionSummary | null): SymbolStatusDisplay {
    const authorityDecision = decision?.authority_decision ?? null;
    const authoritySide = decision?.authority_side ?? null;
    const adoptionReason = decision?.adoption_reason ?? null;
    const v2Decision = decision?.v2_decision ?? null;
    const v2Side = decision?.v2_side ?? null;
    const selectorMismatch = decision?.selector_mismatch === true;
    const v1Decision = decision?.v1_decision ?? null;
    const v1Side = decision?.v1_side ?? null;

    if (authorityDecision === "ENTER" && authoritySide && authoritySide !== "none") {
        return {
            label: "진입 준비",
            reason: "진입 조건이 충족되어 실행 대기 중입니다"
        };
    }

    if (adoptionReason === "legacy_mode_forced" && v2Decision === "ENTER" && v2Side && v2Side !== "none") {
        return {
            label: "보류 중",
            reason: "신호가 감지되었으나 운영 설정에 의해 대기 중입니다"
        };
    }

    if (v2Decision === "HOLD") {
        return {
            label: "진입 검토 중",
            reason: "추가적인 지표 확정을 기다리고 있습니다"
        };
    }

    if (v2Decision === "SKIP" && selectorMismatch) {
        return {
            label: "관망 중",
            reason: "지표 간 불일치로 안전을 위해 대기합니다"
        };
    }

    if (v1Decision === "SKIP" && (v1Side === "none" || !v1Side)) {
        return {
            label: "대기 중",
            reason: "현재 진입 조건을 확인 중입니다"
        };
    }

    return {
        label: "관망 중",
        reason: "조건 충족 전까지 관망합니다"
    };
}

function getRepresentativeStatus(row: any, symbolData: any, hasPosition: boolean): SymbolStatusDisplay {
    if (hasPosition) {
        return {
            label: "포지션 보유 중",
            reason: "현재 열린 포지션이 있어 신규 판단보다 운용 상태를 우선 반영 중"
        };
    }
    const decisionData = symbolData?.decision || symbolData;
    return buildSymbolStatusDisplay(decisionData);
}

function getDirectionBadgeColor(dir: string | null | undefined): string {
    if (!dir) return "bg-slate-50 text-slate-400 border border-slate-100";
    const d = dir.toLowerCase();
    if (d === "long" || d === "buy" || d === "bullish") {
        return "bg-emerald-50 text-emerald-600 border border-emerald-100";
    }
    if (d === "short" || d === "sell" || d === "bearish") {
        return "bg-rose-50 text-rose-600 border border-rose-100";
    }
    return "bg-slate-50 text-slate-500 border border-slate-100";
}

function renderSplitDirections(okxSide: string, candidateDirection: string | null) {
    const okxLabel = okxSide ? (okxSide.toLowerCase() === "short" ? "OKX Short" : "OKX Long") : "OKX 무포지션";
    const candLabel = candidateDirection ? (candidateDirection.toLowerCase() === "short" ? "판단 Short" : "판단 Long") : "판단 관망";
    
    const okxCls = getDirectionBadgeColor(okxSide);
    const candCls = getDirectionBadgeColor(candidateDirection);

    return (
        <div className="flex items-center gap-1.5 text-[10px] font-extrabold">
            <span className={`rounded px-2 py-0.5 ${okxCls}`}>
                {okxLabel}
            </span>
            <span className="text-slate-300">|</span>
            <span className={`rounded px-2 py-0.5 ${candCls}`}>
                {candLabel}
            </span>
        </div>
    );
}

function getDirectionConflictMessage(okxSide: string, candidateDirection: string | null): string {
    const okxLabel = okxSide.toUpperCase() === "SHORT" ? "Short" : "Long";
    const candLabel = candidateDirection ? (candidateDirection.toUpperCase() === "SHORT" ? "Short" : "Long") : "관망(None)";
    return `[방향 충돌 감지] OKX 실제 포지션은 ${okxLabel} 상태이나, 현재 시장판단은 ${candLabel} 방향을 가리키고 있습니다.`;
}

function PositionMoneyCard({
    pos,
    row,
    symbolDecisions,
    showInternalTags,
    exchangeDiagnosticBadge,
    exchangeStatusHeadline,
    manualInterventionSuspected = false,
    syncMismatchDetected = false,
    okxActual = null,
    conflictInfo = null
}: {
    pos: Record<string, any>;
    row: Record<string, unknown> | undefined;
    symbolDecisions: Record<string, unknown> | null;
    showInternalTags: boolean;
    exchangeDiagnosticBadge?: string | null;
    exchangeStatusHeadline?: string | null;
    manualInterventionSuspected?: boolean;
    syncMismatchDetected?: boolean;
    okxActual?: Record<string, unknown> | null;
    conflictInfo?: {
        okxSide: string;
        htfBias: string | null;
        candidateDirection: string | null;
        severity: "conflict" | "warning" | "none";
        message: string;
        nextAction: string | null;
        noEntryReason: string | null;
        htf_5m_bias: string | null;
        htf_15m_bias: string | null;
        htf_1h_bias: string | null;
        htf_4h_bias: string | null;
        htf_1d_bias: string | null;
        sideVetoDetail?: string | null;
    } | null;
}) {
    const n = normalizeOpenPos(pos);
    const sym = String(pos.symbol ?? "");
    const dec = (symbolDecisions as Record<string, { decision?: Record<string, unknown> }> | null)?.[sym]?.decision;
    const mark = n ? markForPosition(pos, row, dec ?? null) : null;
    const uPnL = n ? unrealizedUsdResolved(n, mark) : null;
    const notionalUsd = n?.notionalUsd ?? null;
    const marginUsd = n?.marginUsd ?? null;
    const uPct = formatPctOnMargin(uPnL, marginUsd);
    const hold = formatHoldShort(n?.openedAt ?? null);
    const uClass =
        uPnL === null ? "text-slate-400" : uPnL >= 0 ? "text-emerald-600" : "text-rose-600";
    
    // 보유 방향: 반드시 OKX 실제 포지션 기준
    let displaySide = "Long";
    const rawSide = okxActual 
        ? String(okxActual.side ?? okxActual.posSide ?? "").toLowerCase()
        : String(pos.side ?? "").toLowerCase();

    if (rawSide === "short" || rawSide === "sell") {
        displaySide = "Short";
    } else if (rawSide === "long" || rawSide === "buy") {
        displaySide = "Long";
    }

    const stopDisplay =
        n?.stopPx !== null && n?.stopPx !== undefined && Number.isFinite(n.stopPx!)
            ? formatPrice(n.stopPx)
            : "-";

    const entryDisp = n?.entryPrice !== null && n?.entryPrice !== undefined ? formatPrice(n.entryPrice) : "-";
    const markDisp = mark !== null ? formatPrice(mark) : "-";

    const pe = coerceFinite(pos.partialExitStage);
    const exitProg =
        typeof pe === "number" && Number.isFinite(pe) ? `${Math.max(0, Math.min(3, Math.floor(pe)))}/3` : "-";

    const synthExchange = pos._orb_exchange_only === true;
    const statusLine =
        exchangeStatusHeadline ??
        (dec?.guidance ? String(dec.guidance) : synthExchange ? "실거래소 기준 (원장 미연동)" : "유지");

    // Regime Badges
    const getRegimeBadge = (p: any) => {
        if (!p) return null;
        if (p.sourceSignal === "okx_reconcile_adopted" || p.lifecycleState === "CLOSE_ONLY_MANAGED") {
            if (p.lifecycleState === "CLOSE_ONLY_MANAGED") return { text: "Close-only 관리", cls: "bg-amber-100 text-amber-700 border-amber-200" };
            return { text: "복구 관리", cls: "bg-amber-100 text-amber-700 border-amber-200" };
        }
        const r = p.regimeAtEntry || p.executorAtEntry || p.strategy;
        if (r === "RANGE" || r === "R") return { text: "R", cls: "bg-blue-100 text-blue-700 border-blue-200" };
        if (r === "TREND" || r === "T") return { text: "T", cls: "bg-indigo-100 text-indigo-700 border-indigo-200" };
        if (r === "TRANSITION" || r === "TR") return { text: "TR", cls: "bg-purple-100 text-purple-700 border-purple-200" };
        if (r === "SHOCK" || r === "S") return { text: "S", cls: "bg-orange-100 text-orange-700 border-orange-200" };
        if (r === "NO_TRADE") return { text: "관리", cls: "bg-slate-100 text-slate-700 border-slate-200" };
        return null;
    };

    const rb = getRegimeBadge(pos);

    // Range/Trend specific TP/SL
    let exitTargetLabel = "익절가";
    let exitTargetValue = "-";
    const isTrend = (pos.regimeAtEntry || pos.executorAtEntry || pos.strategy) === "TREND";
    const isRange = (pos.regimeAtEntry || pos.executorAtEntry || pos.strategy) === "RANGE";

    if (isTrend) {
        exitTargetLabel = "추세 청산 기준";
        const trail = coerceFinite(pos.trailingStopPrice);
        const inv = coerceFinite(pos.trendInvalidationPrice);
        if (trail !== null || inv !== null) {
            exitTargetValue = trail !== null ? formatPrice(trail) : formatPrice(inv);
        }
    } else if (isRange) {
        const tp1 = coerceFinite(pos.targetPrice1);
        const tp = coerceFinite(pos.takeProfit);
        if (tp1 !== null || tp !== null) {
            exitTargetValue = formatPrice(tp1 ?? tp);
        }
    } else {
        const tp = coerceFinite(pos.takeProfit);
        if (tp !== null) exitTargetValue = formatPrice(tp);
    }

    // 충돌 상태 보더 & 배경 결정
    const conflictSeverity = conflictInfo?.severity ?? "none";
    let containerBorderCls = "border-slate-200 bg-white";
    if (conflictSeverity === "conflict") {
        containerBorderCls = "border-rose-300 bg-rose-50/10 shadow-rose-50/50";
    } else if (conflictSeverity === "warning") {
        containerBorderCls = "border-amber-300 bg-amber-50/10 shadow-amber-50/50";
    } else if (manualInterventionSuspected) {
        containerBorderCls = "border-rose-300 bg-rose-50/10 shadow-rose-50/50";
    } else if (exchangeDiagnosticBadge || syncMismatchDetected) {
        containerBorderCls = "border-amber-200 bg-amber-50/10";
    }

    return (
        <div className={`rounded-xl border p-5 shadow-sm transition-all hover:shadow-md ${containerBorderCls}`}>
            {exchangeDiagnosticBadge && (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900">
                    경고: {exchangeDiagnosticBadge}
                </div>
            )}

            {/* 방향 충돌 경고창 */}
            {conflictSeverity !== "none" && conflictInfo && (
                <div className={`mb-4 rounded-lg border px-4 py-3 text-xs font-semibold shadow-sm ${
                    conflictSeverity === "conflict" 
                        ? "border-rose-200 bg-rose-50 text-rose-900" 
                        : "border-amber-200 bg-amber-50 text-amber-900"
                }`}>
                    <div className="flex items-start gap-2.5">
                        <span className="text-lg leading-none">{conflictSeverity === "conflict" ? "⛔" : "⚠"}</span>
                        <div className="space-y-1">
                            <p className="font-extrabold">{conflictInfo.message}</p>
                            <p className="font-bold text-rose-600">
                                {getDirectionConflictMessage(displaySide, conflictInfo.candidateDirection)}
                            </p>
                            <p className="font-medium text-slate-500">
                                이는 표시 오류가 아니라 실제 보유 포지션과 시스템 시장판단 방향이 다른 상태입니다.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-bold text-slate-800 notranslate" translate="no">{sym}</span>
                    {renderSplitDirections(displaySide, conflictInfo?.candidateDirection ?? null)}
                    {conflictInfo?.sideVetoDetail === "SHOCK_REACTION_PROMOTION_BYPASS_RANGE_SIDE_VETO" && (
                        <span className="rounded bg-sky-50 px-2 py-0.5 text-[9px] font-bold text-sky-600 border border-sky-100 animate-pulse">
                            Veto Bypass
                        </span>
                    )}
                    {rb && (
                        <span className={`rounded px-2 py-0.5 text-[9px] font-bold border ${rb.cls}`}>
                            {rb.text}
                        </span>
                    )}
                    <span className="text-xs font-medium text-slate-400">· {hold} 보유 중</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">현재 상태:</span>
                    <span className="text-xs font-bold text-slate-600">{statusLine}</span>
                </div>
            </div>

            {manualInterventionSuspected || syncMismatchDetected ? (
                okxActual ? (() => {
                    const okxAvgPx = coerceFinite(okxActual.avgPx) ?? coerceFinite(okxActual.avg_px);
                    const okxMark = coerceFinite(okxActual.markPx) ?? coerceFinite(okxActual.mark_px) ?? mark;
                    const okxContracts = coerceFinite(okxActual.okxContracts) ?? coerceFinite(okxActual.pos);
                    const okxBaseQty = coerceFinite(okxActual.baseQty);
                    const okxNotional = coerceFinite(okxActual.notionalUsd);
                    const { pnl: estPnl, pct: estPct, isEstimated } = estimateOkxPnl(okxActual, mark);
                    const pnlLabel = isEstimated ? "(추정) 미실현 손익" : "미실현 손익 (OKX)";
                    const pctLabel = isEstimated ? "(추정) 수익률" : "수익률 (OKX)";
                    const pnlClass = estPnl === null ? "text-slate-400" : estPnl >= 0 ? "text-emerald-600" : "text-rose-600";
                    const liqPx = coerceFinite(okxActual.liqPx);
                    return (
                        <>
                            <div className={`mt-3 rounded-md border px-3 py-2 text-[11px] font-bold ${manualInterventionSuspected ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                                {manualInterventionSuspected ? "⚠ 외부 수동 개입 확인" : "⚠ 포지션 동기화 불일치"} / OKX 실제 기준 — 아래 값은 OKX 실제 포지션 기준이며 자동매매 성과로 확정하지 않습니다.
                                {isEstimated && <span className={`ml-1 font-normal ${manualInterventionSuspected ? "text-rose-700" : "text-amber-700"}`}>손익은 가격 기반 추정값이며 OKX 공식 수치가 아닙니다.</span>}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                                <MetricCell label="진입가 (OKX)" value={okxAvgPx !== null ? formatPrice(okxAvgPx) : "-"} />
                                <MetricCell label="현재가" value={okxMark !== null ? formatPrice(okxMark) : "-"} valueClass="text-amber-700" />
                                <MetricCell label={pnlLabel} value={estPnl !== null ? toSignedMainKrwSubUsd(estPnl, USDKRW_RATE).krw : "-"} valueClass={pnlClass} />
                                <MetricCell label={pctLabel} value={estPct !== null ? `${estPct >= 0 ? "+" : ""}${(estPct * 100).toFixed(2)}%` : "-"} valueClass={pnlClass} />
                                {okxContracts !== null && <MetricCell label="계약 수 (ct)" value={`${okxContracts} ct`} />}
                                {okxBaseQty !== null && <MetricCell label="BTC 수량" value={`${okxBaseQty.toFixed(4)} BTC`} />}
                                {okxNotional !== null && <MetricCell label="명목금액" value={`${okxNotional.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT`} />}
                                <MetricCell label="레저 손절가 참고" value={stopDisplay} valueClass="text-rose-400" />
                                {liqPx !== null
                                    ? <MetricCell label="청산가 (OKX)" value={formatPrice(liqPx)} valueClass="text-rose-600" />
                                    : <MetricCell label="OKX 청산가" value="미제공" valueClass="text-slate-400" />}
                            </div>
                        </>
                    );
                })()
                : (
                    <>
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900">
                            ⚠ 수동 개입 감지 — OKX 실제 포지션 데이터 수신 불가. 아래 값은 자동 레저 참고값이며 현재 상태와 다를 수 있습니다.
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 opacity-50">
                            <MetricCell label="레저 진입가" value={entryDisp} />
                            <MetricCell label="현재가" value={markDisp} valueClass="text-amber-700" />
                            <MetricCell label="레저 손절가" value={stopDisplay} valueClass="text-rose-500" />
                        </div>
                    </>
                )
            ) : (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <MetricCell label="진입가" value={entryDisp} />
                    <MetricCell label="현재가" value={markDisp} valueClass="text-amber-700" />
                    <MetricCell label="손익" value={uPnL !== null ? toSignedMainKrwSubUsd(uPnL, USDKRW_RATE).krw : "-"} valueClass={uClass} />
                    <MetricCell label="수익률" value={uPct} valueClass={uClass} />
                    <MetricCell label={exitTargetLabel} value={exitTargetValue} valueClass="text-emerald-600" />
                    <MetricCell label="손절가" value={stopDisplay} valueClass="text-rose-500" />
                </div>
            )}

            {showInternalTags && (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                         {coerceFinite(pos._orb_contracts) !== null && (
                             <MetricCell
                                 label="OKX 계약 수(pos)"
                                 value={String(coerceFinite(pos._orb_contracts))}
                                 valueClass="text-slate-700"
                             />
                         )}
                         <MetricCell label="진입금액" value={notionalUsd !== null ? toMainKrwSubUsd(notionalUsd, USDKRW_RATE).krw : "-"} />
                         <MetricCell label="증거금" value={marginUsd !== null ? toMainKrwSubUsd(marginUsd, USDKRW_RATE).krw : "-"} />
                         <MetricCell label="손절가" value={stopDisplay} valueClass="text-rose-500" />
                         <MetricCell label="청산 단계" value={exitProg} valueClass="text-emerald-600" />
                         <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">진입 시각</p>
                            <p className="mt-1 font-mono text-[10px] text-slate-500">{formatDateTimeKst(coerceFinite(pos.openedAt))}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function deriveOperationalCardLabel(
    bundle: Bundle,
    row: Record<string, unknown>,
    hasPosition: boolean
): string {
    if (hasPosition) return "포지션 보유 중";
    const bAny = bundle as Record<string, unknown>;
    const tc = bAny.tradeControl as Record<string, unknown> | undefined;
    const kill = !!(tc?.killSwitch ?? bAny.killSwitch);
    const engine = bundle.engineState as Record<string, unknown> | undefined;
    if (kill) return "차단 중";
    if (engine && engine.entryAllowed === false) return "차단 중";
    const sig = typeof row.signal === "string" ? row.signal : "";
    if (sig === "paper_long_candidate" || sig === "paper_short_candidate") return "진입 대기";
    return "관망 중";
}

function OpenPositionDetailCard({
    pos,
    row,
    symbolDecisions,
    manualInterventionSuspected,
    manualInterventionReasons,
    syncMismatchDetected,
    syncMismatchReasons,
    okxActual
}: {
    pos: Record<string, any>;
    row: Record<string, unknown> | undefined;
    symbolDecisions: Record<string, unknown> | null;
    manualInterventionSuspected: boolean;
    manualInterventionReasons: string[];
    syncMismatchDetected: boolean;
    syncMismatchReasons: string[];
    okxActual: Record<string, unknown> | null;
}) {
    const sym = String(pos.symbol ?? "");
    const dec = (symbolDecisions as Record<string, { decision?: Record<string, unknown> }> | null)?.[sym]?.decision;
    const n = normalizeOpenPos(pos);
    const mark = n ? markForPosition(pos, row, dec ?? null) : null;
    const uPnL = n ? unrealizedUsdResolved(n, mark) : null;
    const marginUsd = n?.marginUsd ?? null;

    const isLedgerPos = !pos._orb_exchange_only;
    const hasMeaningfulData = n !== null && (n.entryPrice !== null || n.notionalUsd !== null);

    if (!hasMeaningfulData) {
        const isFallbackSurface = pos._orb_exchange_only === true;
        return (
            <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-900">
                {isFallbackSurface
                    ? "원격 확인 불가 / 상태 확인 필요"
                    : "포지션 보유 중이나 상세 데이터가 API 응답에 없습니다"}
            </div>
        );
    }

    const side = pos.side === "short" ? "Short ↓" : "Long ↑";
    const sideClass = pos.side === "short" ? "text-rose-600" : "text-emerald-600";
    const entryDisp = n?.entryPrice !== null && n?.entryPrice !== undefined ? formatPrice(n.entryPrice) : "—";
    const markDisp = mark !== null ? formatPrice(mark) : "—";
    const lev = n?.leverage ?? 1;
    const notional = n?.notionalUsd;
    const notionalDisp = notional !== null && notional !== undefined
        ? `${notional.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
        : "—";
    const sizeContracts = coerceFinite(pos.sizeContracts ?? pos._orb_contracts);
    const sizeDisp = sizeContracts !== null ? `${sizeContracts} ct / ${notionalDisp}` : notionalDisp;
    const uClass = uPnL === null ? "text-slate-400" : uPnL >= 0 ? "text-emerald-600" : "text-rose-600";
    const uPnlDisp = uPnL !== null ? formatSignedUsdDisplay(uPnL) : "—";
    const uPctDisp = formatPctOnMargin(uPnL, marginUsd);
    const stopDisp = n?.stopPx !== null && n?.stopPx !== undefined && Number.isFinite(n.stopPx!)
        ? formatPrice(n.stopPx)
        : "—";
    const tp1Disp = coerceFinite(pos.targetPrice1 ?? pos.tp1Price) !== null
        ? formatPrice(coerceFinite(pos.targetPrice1 ?? pos.tp1Price)!)
        : "—";
    const finalTpDisp = coerceFinite(pos.takeProfit ?? pos.finalTp) !== null
        ? formatPrice(coerceFinite(pos.takeProfit ?? pos.finalTp)!)
        : "—";
    const holdDisp = formatHoldShort(n?.openedAt ?? null);
    const entryReason = typeof pos.entryReason === "string" && pos.entryReason.trim() !== ""
        ? pos.entryReason
        : typeof pos.sourceSignal === "string" && pos.sourceSignal.trim() !== ""
        ? pos.sourceSignal
        : "—";

    const hasProtectiveSl = !!pos.protectiveSlAlgoId;
    const hasProtectiveTp = !!pos.protectiveTpAlgoId;
    const protectiveStatus = hasProtectiveSl || hasProtectiveTp
        ? `SL ${hasProtectiveSl ? "✓" : "✗"} / TP ${hasProtectiveTp ? "✓" : "✗"}`
        : typeof pos.protectiveStatus === "string" && pos.protectiveStatus.trim() !== ""
        ? pos.protectiveStatus
        : "—";

    const probeSubmitted = pos.tp1ProbeSubmittedAt ? formatDateTimeKstShort(coerceFinite(pos.tp1ProbeSubmittedAt)) : null;
    const probeFilled = pos.tp1ProbeFilledAt ? formatDateTimeKstShort(coerceFinite(pos.tp1ProbeFilledAt)) : null;
    const probeDisp = probeSubmitted ? `제출: ${probeSubmitted}${probeFilled ? ` / 체결: ${probeFilled}` : " / 미체결"}` : "—";

    const reconcileStatus = typeof pos.reconcileStatus === "string" ? pos.reconcileStatus
        : typeof pos.sync_status === "string" ? pos.sync_status
        : "—";

    const okxSyncDisp = typeof pos.okxSyncStatus === "string" ? pos.okxSyncStatus
        : isLedgerPos ? "원장 기준" : "OKX 기준";

    const detail = (label: string, value: string, valClass?: string) => (
        <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className={`mt-0.5 font-mono text-xs font-semibold truncate ${valClass ?? "text-slate-700"}`}>{value}</p>
        </div>
    );

    // OKX 실제 포지션 필드 추출
    const okxSide = okxActual ? String(okxActual.side ?? okxActual.posSide ?? "—") : "—";
    const okxQty = okxActual ? (coerceFinite(okxActual.pos) ?? coerceFinite(okxActual.notional) ?? null) : null;
    const okxQtyDisp = okxQty !== null ? String(okxQty) : "—";
    const okxAvgPx = okxActual ? (coerceFinite(okxActual.avgPx) ?? coerceFinite(okxActual.avg_px) ?? null) : null;
    const okxAvgDisp = okxAvgPx !== null ? formatPrice(okxAvgPx) : "—";
    const okxMark = okxActual ? (coerceFinite(okxActual.markPx) ?? coerceFinite(okxActual.mark_px) ?? mark) : mark;
    const okxMarkDisp = okxMark !== null ? formatPrice(okxMark) : markDisp;
    const okxSource = okxActual ? String(okxActual.source ?? okxActual.mgnMode ?? "OKX") : "—";

    const borderClass = manualInterventionSuspected
        ? "border-rose-300 bg-rose-50/20"
        : syncMismatchDetected
            ? "border-amber-200 bg-amber-50/20"
            : "border-emerald-100 bg-emerald-50/30";
    const headerClass = manualInterventionSuspected
        ? "border-b border-rose-300 bg-rose-50/60 px-3 py-2"
        : syncMismatchDetected
            ? "border-b border-amber-200 bg-amber-50/60 px-3 py-2"
            : "border-b border-emerald-100 bg-emerald-50/60 px-3 py-2";
    const headerTextClass = manualInterventionSuspected
        ? "text-[10px] font-black uppercase tracking-widest text-rose-700"
        : syncMismatchDetected
            ? "text-[10px] font-black uppercase tracking-widest text-amber-700"
            : "text-[10px] font-black uppercase tracking-widest text-emerald-700";

    const isAnyWarning = manualInterventionSuspected || syncMismatchDetected;
    const warningReasons = manualInterventionSuspected ? manualInterventionReasons : syncMismatchReasons;
    const warningTitle = manualInterventionSuspected ? "⚠️ 외부 수동 개입 확인" : "⚠️ 포지션 동기화 불일치";

    return (
        <div className={`mt-3 overflow-hidden rounded-lg border ${borderClass}`}>
            <div className={headerClass}>
                <p className={headerTextClass}>
                    {isAnyWarning ? `${warningTitle} / 보유 포지션 상세` : "보유 포지션 상세"}
                </p>
            </div>

            {isAnyWarning && (
                <div className={`border-b ${manualInterventionSuspected ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"} px-3 py-3 space-y-2`}>
                    <p className={`text-xs font-bold ${manualInterventionSuspected ? "text-rose-900" : "text-amber-900"}`}>
                        {manualInterventionSuspected 
                            ? "⚠ 외부에서 수동으로 개입한 포지션입니다. 자동매매 성과로 확정하지 않습니다." 
                            : "⚠ 자동 장부와 OKX 실제 포지션이 다릅니다. 이 손익은 자동매매 성과로 확정하지 않습니다."}
                    </p>
                    <ul className="space-y-0.5">
                        {warningReasons.map((r, i) => (
                            <li key={i} className={`text-[11px] font-medium ${manualInterventionSuspected ? "text-rose-800" : "text-amber-800"}`}>· {r}</li>
                        ))}
                    </ul>
                    <p className={`text-[10px] font-semibold ${manualInterventionSuspected ? "text-rose-700 border-t border-rose-200" : "text-amber-700 border-t border-amber-200"} pt-2`}>
                        ⛔ 정합성 확인 전 {String(pos.symbol ?? "")} 신규 자동 진입 차단 필요 | 강제 청산 또는 history 확정 기록 생성 금지
                    </p>
                </div>
            )}

            {isAnyWarning ? (
                okxActual ? (() => {
                    const { pnl: estPnl, pct: estPct, isEstimated: isEst } = estimateOkxPnl(okxActual, okxMark);
                    const pnlLabel = isEst ? "(추정) 미실현 손익" : "미실현 손익 (OKX)";
                    const pctLabel = isEst ? "(추정) 수익률" : "손익률 (OKX)";
                    const pnlClass = estPnl === null ? "text-slate-400" : estPnl >= 0 ? "text-emerald-600" : "text-rose-600";
                    const okxContracts = coerceFinite(okxActual.okxContracts) ?? coerceFinite(okxActual.pos);
                    const okxBaseQty = coerceFinite(okxActual.baseQty);
                    const okxNotional = coerceFinite(okxActual.notionalUsd);
                    const liqPx = coerceFinite(okxActual.liqPx);
                    return (
                        <>
                        <div className="px-3 pt-3 pb-2 bg-amber-50/40">
                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-700 mb-1">OKX 실제 포지션 기준</p>
                            <p className="text-[10px] text-amber-800 mb-1">자동 장부와 OKX 실제 포지션이 다릅니다. 아래 값은 OKX 실제 포지션 기준이며 자동매매 성과로 확정하지 않습니다.</p>
                            {isEst && <p className="text-[10px] text-amber-600 mb-3">※ 미실현 손익은 가격 기반 추정값이며 OKX 공식 수치가 아닙니다 (markPx·upl·uplRatio 미제공).</p>}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                                {detail("방향 (OKX)", (() => { const s = String(okxActual.side ?? okxActual.posSide ?? "—").toLowerCase(); return s === "short" ? "Short ↓" : s === "long" ? "Long ↑" : s; })(), (() => { const s = String(okxActual.side ?? okxActual.posSide ?? "").toLowerCase(); return s === "short" ? "text-rose-600" : "text-emerald-600"; })())}
                                {detail("진입가 (avgPx)", okxAvgDisp)}
                                {detail("현재가", okxMarkDisp, "text-amber-700")}
                                {okxContracts !== null && detail("계약 수 (ct)", `${okxContracts} ct`)}
                                {okxBaseQty !== null && detail("BTC 수량", `${okxBaseQty.toFixed(4)} BTC`)}
                                {okxNotional !== null && detail("명목금액", `${okxNotional.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT`)}
                                {detail(pnlLabel, estPnl !== null ? formatSignedUsdDisplay(estPnl) : "—", pnlClass)}
                                {detail(pctLabel, estPct !== null ? `${estPct >= 0 ? "+" : ""}${(estPct * 100).toFixed(2)}%` : "—", pnlClass)}
                                {liqPx !== null
                                    ? detail("청산가 (liqPx)", formatPrice(liqPx), "text-rose-600")
                                    : detail("OKX 청산가", "미제공", "text-slate-400")}
                                {detail("Source", okxSource)}
                            </div>
                        </div>
                        <div className="border-t border-amber-100 px-3 pt-3 pb-2 bg-slate-50/60">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">자동 레저 기준 참고값</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                                {detail("레저 방향", side, sideClass)}
                                {detail("레저 진입가", entryDisp)}
                                {detail("레저 손절가", stopDisp, "text-rose-500")}
                                {detail("진입 사유", entryReason)}
                                {detail("보유 시간", holdDisp)}
                            </div>
                        </div>
                    </>
                    );
                })()
                : (
                    <div className="px-3 py-4">
                        <p className="text-xs font-bold text-amber-800">OKX 실제 포지션 데이터를 받을 수 없어 현재 기준 표시 불가</p>
                        <p className="mt-1 text-[11px] text-slate-500">아래는 자동 레저 참고값이며 실제 포지션과 다를 수 있습니다.</p>
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                            {detail("레저 방향", side, sideClass)}
                            {detail("레저 진입가", entryDisp)}
                            {detail("레저 손절가", stopDisp, "text-rose-500")}
                            {detail("진입 사유", entryReason)}
                            {detail("보유 시간", holdDisp)}
                        </div>
                    </div>
                )
            ) : (
                <div className="px-3 pt-3 pb-1">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                        {detail("방향", side, sideClass)}
                        {detail("진입가", entryDisp)}
                        {detail("현재가", markDisp, "text-amber-700")}
                        {detail("수량 / 명목금액", sizeDisp)}
                        {detail("레버리지", `${lev}x`)}
                        {detail("미실현 손익", uPnlDisp, uClass)}
                        {detail("미실현 손익 %", uPctDisp, uClass)}
                        {detail("손절가", stopDisp, "text-rose-500")}
                        {detail("TP1", tp1Disp, "text-emerald-600")}
                        {detail("Final TP", finalTpDisp, "text-emerald-700")}
                        {detail("보유 시간", holdDisp)}
                        {detail("진입 사유", entryReason)}
                    </div>
                </div>
            )}


            {/* 정합성 상태 및 반화드/프로브 */}
            <div className="border-t border-slate-100 px-3 pt-3 pb-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">정합성 및 보호
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    {detail("보호 주문 상태", protectiveStatus)}
                    {detail("Probe TP1", probeDisp)}
                    {detail("장부 정합성", reconcileStatus)}
                    {detail("OKX 동기화", okxSyncDisp)}
                </div>
            </div>
        </div>
    );
}

function SymbolStatusCard({
    bundle,
    row,
    symbolDecisions,
    showInternalTags,
    hasPosition,
    clientNowMs,
    positionSlots
}: {
    bundle: Bundle;
    row: Record<string, unknown>;
    symbolDecisions: Record<string, unknown> | null;
    showInternalTags: boolean;
    hasPosition: boolean;
    clientNowMs: number;
    positionSlots: PositionDisplaySlot[];
}) {
    const sym = String(row.symbol);
    const symbolData = (symbolDecisions as Record<string, any> | null)?.[sym];
    const rep = getRepresentativeStatus(row, symbolData, hasPosition);

    // POLARITY_MISMATCH 차단 조건 판정
    const bRec = bundle as Record<string, unknown>;
    const auditRow = pickNoEntryAuditRow(bRec, sym);
    const hasPolarityMismatch = auditRow != null && 
        auditRow.expected_missing_condition != null && 
        String(auditRow.expected_missing_condition).includes("POLARITY_MISMATCH");
    const isLongCandidate = auditRow != null && 
        (auditRow.trend_side_candidate === "long" || auditRow.trend_side_candidate === "LONG");
    const isHtfBearish = auditRow != null && (
        String(auditRow.htf_1h_bias).toUpperCase() === "BEARISH" ||
        String(auditRow.htf_4h_bias).toUpperCase() === "BEARISH" ||
        String(auditRow.htf_1d_bias).toUpperCase() === "BEARISH"
    );
    const isPolarityMismatchBlockedLong = hasPolarityMismatch && isLongCandidate && isHtfBearish;

    const rawStateLabel = deriveOperationalCardLabel(bundle, row, hasPosition);
    const stateLabel = (isPolarityMismatchBlockedLong && !hasPosition) ? "관망 중" : rawStateLabel;


    const judgeTs = noEntryJudgmentTsMs(auditRow);
    const auditMissing = auditRow === null;
    const stale = judgeTs === null ? true : isStaleNoEntryAudit(judgeTs, clientNowMs);
    const ageMs = judgeTs !== null ? Math.max(0, clientNowMs - judgeTs) : null;
    const activeSlot = positionSlots.find((s) => String(s.pos.symbol) === sym);
    const activeRow = bundle.symbolRows?.find((r) => r.symbol === sym);
    const isManualIntervention = activeSlot?.manualInterventionSuspected === true;
    const isSyncMismatch = activeSlot?.syncMismatchDetected === true;
    const effectiveStateLabel = isManualIntervention ? "외부 수동 개입 확인" : isSyncMismatch ? "포지션 동기화 불일치" : stateLabel;

    const badgeClass = isManualIntervention
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : isSyncMismatch
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : effectiveStateLabel === "포지션 보유 중"
            ? "bg-emerald-50 text-emerald-600 border-emerald-100"
            : effectiveStateLabel === "진입 대기"
              ? "bg-indigo-50 text-indigo-600 border-indigo-100"
              : effectiveStateLabel === "차단 중"
                ? "bg-rose-50 text-rose-600 border-rose-100"
                : "bg-slate-50 text-slate-500 border-slate-100";

    const auditTextBlock = (title: string, summary: string, rawAux?: string | null, mutedSummary = false) => (
        <div className="min-w-0 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
            <p
                className={`mt-1 text-sm leading-relaxed break-words whitespace-normal ${mutedSummary ? "font-normal text-slate-400" : "font-semibold text-slate-800"}`}
                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
            >
                {summary}
            </p>
            {rawAux ? (
                <p className="mt-1 font-mono text-[10px] leading-snug break-all text-slate-400" title={rawAux}>
                    코드 참조 · {rawAux}
                </p>
            ) : null}
        </div>
    );

    const kvLine = (label: string, val: string, muted = false) => (
        <div className={`min-w-0 ${muted ? "text-slate-400" : ""}`}>
            <span className="inline-block max-w-full text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
            <p className={`mt-0.5 text-xs leading-relaxed break-words ${muted ? "font-normal text-slate-400" : "font-semibold text-slate-700"}`} style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                {val}
            </p>
        </div>
    );

    let body: ReactNode;
    if (hasPosition) {
        body = (
            <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-600">
                    {isManualIntervention
                        ? "외부 수동 개입 확인 / 장부 정합성 확인 필요"
                        : isSyncMismatch
                        ? "포지션 동기화 불일치 / 장부 정합성 확인 필요"
                        : rep.reason}
                </p>
                {activeSlot ? (
                    <OpenPositionDetailCard
                        pos={activeSlot.pos}
                        row={activeRow as Record<string, unknown> | undefined}
                        symbolDecisions={symbolDecisions}
                        manualInterventionSuspected={activeSlot.manualInterventionSuspected}
                        manualInterventionReasons={activeSlot.manualInterventionReasons}
                        syncMismatchDetected={activeSlot.syncMismatchDetected}
                        syncMismatchReasons={activeSlot.syncMismatchReasons}
                        okxActual={activeSlot.okxActual}
                    />
                ) : (
                    <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-900">
                        포지션 보유 중
                    </div>
                )}
                {!auditMissing && (
                    <p className="text-[10px] text-slate-400">
                        (참고) 마지막 무진입 스냅샷:{" "}
                        {stale
                            ? `최근 판단 갱신 대기 · ${ageMs !== null ? formatRelativeAgeKo(ageMs) : "—"}`
                            : `${formatTimeHmssKst(judgeTs)} · ${ageMs !== null ? formatRelativeAgeKo(ageMs) : "—"}`}
                    </p>
                )}
            </div>
        );
    } else if (auditMissing) {
        body = (
            <div className="mt-3 space-y-2">
                <p className="rounded-md border border-amber-100 bg-amber-50/60 px-2 py-1.5 text-xs font-medium text-amber-900">
                    무진입 감사 데이터 없음 · API 필드 noEntryAuditBySymbol 또는 엔진 스냅샷 확인
                </p>
                <p className="text-xs font-medium text-slate-600">{describeSnapshotContext(row)}</p>
                <p className="text-[10px] text-slate-400">
                    상태 요약(내부): {rep.label} — {rep.reason}
                </p>
            </div>
        );
    } else if (stale) {
        body = (
            <div className="mt-3 space-y-3">
                <p className="rounded-md border border-amber-200 bg-amber-50/50 px-2 py-1.5 text-xs font-bold text-amber-900">
                    최근 판단 갱신 대기
                </p>
                <p className="text-xs text-slate-500">
                    마지막 판단:{" "}
                    {judgeTs !== null
                        ? `${formatTimeHmssKst(judgeTs)} · ${formatRelativeAgeKo(ageMs ?? 0)}`
                        : "—"}
                </p>
                <p className="text-[10px] text-slate-400">
                    {NO_ENTRY_AUDIT_STALE_MS / 1000}초 이상 경과한 사유는 현재 판단으로 표시하지 않습니다.
                </p>
            </div>
        );
    } else {
        const rowRec = auditRow as Record<string, unknown>;
        const exp = auditRow.expected_missing_condition;
        const next = auditRow.expected_next_action;
        const zone = auditRow.zone != null ? String(auditRow.zone) : "—";
        const q =
            auditRow.entry_quality_grade != null || typeof auditRow.quality_score === "number"
                ? `${auditRow.entry_quality_grade != null ? String(auditRow.entry_quality_grade) : "—"}${
                      typeof auditRow.quality_score === "number" ? `(${auditRow.quality_score})` : ""
                  }`
                : "—";

        const htfPolicy = auditRow.htf_entry_policy;
        const counterTrend = auditRow.counter_trend_risk;
        const showHtf = noEntryRowHasHtf(rowRec);

        // POLARITY_MISMATCH 차단 조건 판정
        const hasPolarityMismatch = exp != null && String(exp).includes("POLARITY_MISMATCH");
        const isLongCandidate = auditRow.trend_side_candidate === "long" || auditRow.trend_side_candidate === "LONG";
        const isHtfBearish = 
            String(rowRec.htf_1h_bias).toUpperCase() === "BEARISH" ||
            String(rowRec.htf_4h_bias).toUpperCase() === "BEARISH" ||
            String(rowRec.htf_1d_bias).toUpperCase() === "BEARISH";
        const isPolarityMismatchBlockedLong = hasPolarityMismatch && isLongCandidate && isHtfBearish;

        const missingConditionTitle = "무진입 사유";
        const missingConditionText = isPolarityMismatchBlockedLong
            ? "상위봉 Bearish 상태에서 Long 반등 후보가 감지됐지만, 방향 불일치로 차단 중"
            : mapNoEntryExpectedMissing(exp);

        const nextActionTitle = isPolarityMismatchBlockedLong ? "진입 조건" : "다음 대기";
        const nextActionText = isPolarityMismatchBlockedLong
            ? "상위봉 정렬 회복 또는 Short 후보 재형성 필요"
            : mapNoEntryNextAction(next);

        body = (
            <div className="mt-3 min-w-0 space-y-4 overflow-hidden">
                <div className="space-y-4 border-b border-slate-100 pb-4">
                    {auditTextBlock(missingConditionTitle, missingConditionText, noEntryExpectedMissingRawForDetail(exp))}
                    {auditTextBlock(nextActionTitle, nextActionText, noEntryNextActionRawForDetail(next))}
                </div>

                {showHtf ? (
                    <div className="min-w-0 space-y-3 rounded-lg border border-slate-100 bg-slate-50/90 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">상위봉(HTF)</p>
                        <div className="space-y-3 text-xs">
                            {auditTextBlock("상위봉 판세·소스", mapMacroSourceDisplay(auditRow.macro_source), null)}
                            {kvLine("5m bias", formatHtfBiasField(rowRec.htf_5m_bias))}
                            {kvLine("15m bias", formatHtfBiasField(rowRec.htf_15m_bias))}
                            {kvLine("1h bias", formatHtfBiasField(rowRec.htf_1h_bias))}
                            {kvLine("4h bias", formatHtfBiasField(rowRec.htf_4h_bias))}
                            {kvLine("1d bias", formatHtfBiasField(rowRec.htf_1d_bias))}
                            <div>{auditTextBlock("HTF 정책", mapHtfEntryPolicy(htfPolicy), htfEntryPolicyRawForDetail(htfPolicy))}</div>
                            {kvLine(
                                "상위봉 역방향 위험",
                                counterTrend === true || counterTrend === false ? formatBoolKo(counterTrend) : formatEmpty(counterTrend, "—")
                            )}
                            {kvLine("사이즈 배율", formatHtfSizeMultiplier(rowRec.htf_size_multiplier))}
                            {kvLine(
                                "강한 확인 필요",
                                rowRec.htf_requires_stronger_confirmation === true || rowRec.htf_requires_stronger_confirmation === false
                                    ? formatBoolKo(rowRec.htf_requires_stronger_confirmation)
                                    : formatEmpty(rowRec.htf_requires_stronger_confirmation, "—")
                            )}
                            {rowRec.htf_hard_block_reason != null && String(rowRec.htf_hard_block_reason).trim() !== "" ? (
                                <div className="min-w-0 rounded border border-amber-100/80 bg-white/60 px-2 py-1.5">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700/90">HTF 단단 차단 근거</p>
                                    <p className="mt-1 font-mono text-[10px] leading-snug break-all text-amber-900/80">
                                        {String(rowRec.htf_hard_block_reason)}
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
                    {(() => {
                        const candidateDirection = formatSideCandidateEn(auditRow.trend_side_candidate);
                        const isHtfHold = htfPolicy === "HOLD";

                        if (candidateDirection && candidateDirection !== "관망" && candidateDirection !== "—" && hasPolarityMismatch) {
                            const isShortCandidate = auditRow.trend_side_candidate === "short" || auditRow.trend_side_candidate === "SHORT";
                            const isHtfBullish = 
                                String(rowRec.htf_1h_bias).toUpperCase() === "BULLISH" ||
                                String(rowRec.htf_4h_bias).toUpperCase() === "BULLISH" ||
                                String(rowRec.htf_1d_bias).toUpperCase() === "BULLISH";

                            let blockMessage = "방향 불일치로 진입 차단";
                            if (isLongCandidate && isHtfBearish) {
                                blockMessage = "상위봉 Bearish와 Long shock 불일치로 진입 차단";
                            } else if (isShortCandidate && isHtfBullish) {
                                blockMessage = "상위봉 Bullish와 Short shock 불일치로 진입 차단";
                            }

                            return (
                                <div className="min-w-0">
                                    <span className="inline-block max-w-full text-[10px] font-bold uppercase tracking-wider text-rose-500">차단된 후보 방향</span>
                                    <p className="mt-0.5 text-xs font-semibold text-rose-600">
                                        {candidateDirection}
                                    </p>
                                    <p className="mt-1 text-[10px] font-bold text-rose-500 leading-snug">
                                        {blockMessage}
                                    </p>
                                </div>
                            );
                        } else if (isHtfHold) {
                            return (
                                <div className="min-w-0">
                                    <span className="inline-block max-w-full text-[10px] font-bold uppercase tracking-wider text-slate-400">진입 정책</span>
                                    <p className="mt-0.5 text-xs font-semibold text-slate-700">
                                        상위봉 정렬 대기
                                    </p>
                                    <p className="mt-1 text-[10px] text-slate-400 leading-snug">
                                        현재 후보 방향은 관찰용이며 진입 허용 상태가 아닙니다.
                                    </p>
                                </div>
                            );
                        } else {
                            return kvLine("후보 방향", candidateDirection);
                        }
                    })()}
                    {kvLine("구간", zone)}
                    {kvLine("품질", q)}
                    {kvLine("추격 차단", formatBoolKo(auditRow.chase_blocked))}
                    {kvLine("리테스트 필요", formatBoolKo(auditRow.retest_required))}
                    {kvLine("지지 재확인 필요", formatBoolKo(auditRow.reclaim_required))}
                    <div className="min-w-0 sm:col-span-2">
                        {kvLine(
                            "마지막 판단",
                            judgeTs !== null ? `${formatTimeHmssKst(judgeTs)} · ${formatRelativeAgeKo(ageMs ?? 0)}` : "—"
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
                <div className="font-mono text-lg font-bold text-slate-800 notranslate" translate="no">
                    {sym}
                </div>
                <div className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${badgeClass}`}>{stateLabel}</div>
            </div>

            <div className="mt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">상태</p>
                <p className="text-sm font-bold text-slate-800">{stateLabel}</p>
            </div>

            {body}

            {showInternalTags && (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">스냅샷 맥락</p>
                            <p className="mt-0.5 text-xs font-medium text-slate-600">{describeSnapshotContext(row)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">틱 수신 시각</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">{formatDateTimeKst(row.fetchedAt)}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function RecentPerformanceSection({
    perf,
    history
}: {
    perf: LedgerPerformance | null;
    history: any[];
}) {
    const now = Date.now();
    const last24hTrades = history.filter(t => t.closedAt && (now - t.closedAt) < 24 * 60 * 60 * 1000);
    const pnl24h = last24hTrades.length > 0 ? last24hTrades.reduce((acc, t) => acc + (t.pnlUsdNet || 0), 0) : null;

    const last5 = [...history].reverse().slice(0, 5);
    const w7 = perf?.last7d ?? null;
    const w30 = perf?.last30d ?? null;

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">최근 거래 현황</h2>
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCell label="24시간 손익" value={pnl24h !== null ? toSignedMainKrwSubUsd(pnl24h, USDKRW_RATE).krw : "-"} valueClass={pnl24h === null ? "" : pnl24h >= 0 ? "text-emerald-600" : "text-rose-600"} />
                <MetricCell label="7일 손익" value={toSignedMainKrwSubUsd(w7?.totalPnlUsdNet ?? 0, USDKRW_RATE).krw} valueClass={(w7?.totalPnlUsdNet ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"} />
                <MetricCell label="30일 손익" value={toSignedMainKrwSubUsd(w30?.totalPnlUsdNet ?? 0, USDKRW_RATE).krw} valueClass={(w30?.totalPnlUsdNet ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"} />
                <MetricCell label="7일 승률" value={formatPercent(w7?.winRate ?? null)} />
                <MetricCell label="종료 건수" value={formatCount(w7?.totalTrades ?? 0) + "건"} />
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600">
                        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <tr>
                                <th className="px-5 py-3">종목</th>
                                <th className="px-5 py-3">방향</th>
                                <th className="px-5 py-3">진입가</th>
                                <th className="px-5 py-3">손익</th>
                                <th className="px-5 py-3">수익률</th>
                                <th className="px-5 py-3">종료 사유</th>
                                <th className="px-5 py-3 text-right">종료 시각</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {last5.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-8 text-center text-slate-400 italic">
                                        기록 없음
                                    </td>
                                </tr>
                            ) : (
                                last5.map((t, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-5 py-3 font-mono font-bold text-slate-700 notranslate" translate="no">{t.symbol}</td>
                                        <td className="px-5 py-3">
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.side === "short" ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"}`}>
                                                {t.side === "short" ? "Short" : "Long"}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 font-mono text-slate-500">{formatPrice(t.entryPrice)}</td>
                                        <td className={`px-5 py-3 font-mono font-bold ${(t.pnlUsdNet || 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                            {toSignedMainKrwSubUsd(t.pnlUsdNet || 0, USDKRW_RATE).krw}
                                        </td>
                                        <td className={`px-5 py-3 font-mono font-bold ${(t.pnlUsdNet || 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                            {typeof t.realizedPnlPct === "number" && Number.isFinite(t.realizedPnlPct)
                                                ? formatPercent(t.realizedPnlPct)
                                                : formatPctOnMargin(t.pnlUsdNet ?? null, closedTradeMarginUsd(t as Record<string, unknown>))}
                                        </td>
                                        <td className="px-5 py-3">
                                            {(() => {
                                                const { label } = formatExitReason(t.exitType || t.exitReason);
                                                const naturalLabel = label === "Manual" ? "수동" : 
                                                                    label === "Stop Loss" ? "손절" : 
                                                                    label === "Take Profit" ? "익절" : 
                                                                    label === "Liquidation" ? "청산" : label;
                                                return <span className="font-medium text-slate-600">{naturalLabel}</span>;
                                            })()}
                                        </td>
                                        <td className="px-5 py-3 text-right text-[10px] text-slate-400">{formatDateTimeKst(t.closedAt)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}

function LastClosedSummaryCard({ trade }: { trade: any }) {
    if (!trade) return null;
    const pnlClass = (trade.pnlUsdNet ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600";
    const holdMin = trade.closedAt && trade.openedAt ? Math.floor((trade.closedAt - trade.openedAt) / 60000) : null;

    return (
        <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">최근 종료 거래</h2>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="bg-slate-50/50 px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="font-mono text-lg font-bold text-slate-800">{trade.symbol}</div>
                            <span className={`rounded px-2 py-0.5 text-[10px] font-bold border ${trade.side === "short" ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"}`}>
                                {trade.side === "short" ? "Short" : "Long"}
                            </span>
                            <span className="text-xs font-medium text-slate-400">{formatDateTimeKst(trade.closedAt)}</span>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">실현 손익</p>
                                <p className={`mt-0.5 font-mono text-base font-bold ${pnlClass}`}>{toSignedMainKrwSubUsd(trade.pnlUsdNet || 0, USDKRW_RATE).krw}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">수익률</p>
                                <p className={`mt-0.5 font-mono text-base font-bold ${pnlClass}`}>
                                    {typeof trade.realizedPnlPct === "number" ? formatPercent(trade.realizedPnlPct) : "-"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="border-t border-slate-100 px-6 py-3">
                    <div className="flex flex-wrap items-center gap-x-10 gap-y-2">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">사유</p>
                            <p className="mt-0.5 text-xs font-bold text-slate-600">
                                {(() => {
                                    const { label } = formatExitReason(trade.exitType || trade.exitReason);
                                    return label === "Manual" ? "수동" : 
                                           label === "Stop Loss" ? "손절" : 
                                           label === "Take Profit" ? "익절" : 
                                           label === "Liquidation" ? "청산" : label;
                                })()}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">보유</p>
                            <p className="mt-0.5 text-xs font-medium text-slate-500">{holdMin !== null ? `${holdMin}분` : "-"}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">진입/종료</p>
                            <p className="mt-0.5 font-mono text-xs text-slate-500">
                                {formatPrice(trade.entryPrice)} → {formatPrice(trade.exitPrice)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function OperatorControlSection({
    bundle,
    onAction,
    isProcessing
}: {
    bundle: Bundle;
    onAction: (action: string, params?: any) => Promise<void>;
    isProcessing: boolean;
}) {
    const tradeControl =
        (bundle as any).tradeControl ??
        (bundle.dashboard && typeof bundle.dashboard === "object"
            ? (bundle.dashboard as any).tradeControl
            : null) ??
        (bundle.engineState ?? null);
    const tradeEnabled = (bundle.serverTradeEnabled ?? tradeControl?.serverTradeEnabled ?? false) === true;
    const closeOnly = (bundle.closeOnlyMode ?? tradeControl?.closeOnlyMode ?? false) === true;
    const killActive = (bundle.killSwitch ?? tradeControl?.killSwitch ?? false) === true;
    const updatedAt = coerceFinite(bundle.trade_control_updated_at ?? tradeControl?.updatedAt);
    const paperOperational = getPaperOperational(bundle);
    const entryReady = paperOperational?.entry_ready_for_new_position === true;
    const entryReasons = Array.isArray(paperOperational?.entry_ready_reasons)
        ? (paperOperational?.entry_ready_reasons as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0)
        : [];

    return (
        <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">운영 제어</h2>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-6">
                    <div className="flex items-center gap-10">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">자동매매 상태</p>
                            <div className="mt-1.5 flex items-center gap-2">
                                <div className={`h-2 w-2 rounded-full ${tradeEnabled ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.3)]" : "bg-slate-300"}`} />
                                <span className={`text-sm font-bold ${tradeEnabled ? "text-emerald-600" : "text-slate-500"}`}>
                                    {tradeEnabled ? "운영 중" : "정지됨"}
                                </span>
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">신규 진입</p>
                            <div className="mt-1.5 flex flex-col gap-0.5">
                                <span className={`text-sm font-bold ${
                                    (!tradeEnabled || killActive || closeOnly) ? "text-rose-500" : 
                                    entryReady ? "text-emerald-600" : "text-slate-500"
                                }`}>
                                    {(!tradeEnabled || killActive || closeOnly) ? "신규 진입 중지" : 
                                     entryReady ? "신규 진입 가능" : "진입 대기"}
                                </span>
                                {entryReasons.length > 0 && (
                                    <p className="max-w-64 text-[10px] text-slate-400 font-medium">
                                        {entryReasons.map(r => {
                                            if (r === "WAIT_RECHECK") return "V2 구조 확인 중";
                                            if (r === "STRUCTURE_NOT_READY") return "V2 구조 확인 중";
                                            if (r === "TRANSITION_RANGE_TO_TREND") return "V2 구조 확인 중";
                                            return r;
                                        }).join(" · ")}
                                    </p>
                                )}
                            </div>
                        </div>
                        {closeOnly && (
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500">청산 전용</p>
                                <p className="mt-1.5 text-sm font-bold text-rose-600">활성</p>
                            </div>
                        )}
                        {killActive && (
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500">킬스위치</p>
                                <p className="mt-1.5 text-sm font-bold text-rose-600">활성</p>
                            </div>
                        )}
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">마지막 변경</p>
                            <p className="mt-1.5 text-xs font-medium text-slate-400">
                                {updatedAt ? formatDateTimeKstShort(updatedAt) : "-"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            disabled={isProcessing || tradeEnabled}
                            onClick={() => onAction("SET_TRADE", { enabled: true })}
                            className={`rounded px-4 py-1.5 text-xs font-bold transition-all ${tradeEnabled ? "bg-slate-50 text-slate-300 cursor-not-allowed" : "bg-slate-800 text-white hover:bg-slate-700 shadow-sm"}`}
                        >
                            매매 시작
                        </button>
                        <button
                            disabled={isProcessing || !tradeEnabled}
                            onClick={() => onAction("SET_TRADE", { enabled: false })}
                            className={`rounded px-4 py-1.5 text-xs font-bold transition-all ${!tradeEnabled ? "bg-slate-50 text-slate-300 cursor-not-allowed" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"}`}
                        >
                            매매 정지
                        </button>
                    </div>
                </div>
                {isProcessing && (
                    <div className="mt-3 text-[9px] font-bold text-amber-600 uppercase">
                        명령 전송 중...
                    </div>
                )}
            </div>
        </section>
    );
}

export default function FuturesPaperClientPage({ initialBundle }: { initialBundle: Bundle }) {
    const [bundle, setBundle] = useState<Bundle>(initialBundle);
    const [err, setErr] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [clientNowMs, setClientNowMs] = useState(() => Date.now());
    const [showInternalTags, setShowInternalTags] = useState(false);
    const [isProcessingControl, setIsProcessingControl] = useState(false);

    const refreshData = async () => {
        setIsRefreshing(true);
        try {
            const res = await fetch(`/api/futures-paper/data?t=${Date.now()}`, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const j = (await res.json()) as Bundle;
            setBundle(j);
            setLastUpdated(new Date());
            setErr(null);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            refreshData();
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const id = window.setInterval(() => setClientNowMs(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const handleControlAction = async (action: string, params: any = {}) => {
        setIsProcessingControl(true);
        try {
            const res = await fetch("/api/futures-paper/control", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...params })
            });
            if (!res.ok) {
                const j = await res.json();
                throw new Error(j.error || `HTTP ${res.status}`);
            }
            // After successful control, immediate refresh
            await refreshData();
        } catch (e) {
            alert(`제어 실패: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsProcessingControl(false);
        }
    };

    const perf = bundle?.ledgerPerformance ?? null;
    const history = Array.isArray(bundle?.positionsHistory) ? bundle.positionsHistory : [];
    const lastClosed = history.length > 0 ? history[history.length - 1] : null;

    const engine = bundle?.engineState ?? null;
    const curRegime = pick(engine, ["current_regime", "currentRegime", "regime"]);
    const riskState = pick(engine, ["risk_state", "riskStatus", "risk_state_status"]);
    const executor = pick(engine, ["active_mode_executor", "activeModeExecutor", "executor"]);

    const positionSlots = buildPositionDisplaySlots(bundle);
    const symbolDecisions = (engine as any)?.symbol_decisions ?? null;

    const pm = bundle ? aggregatePortfolioMetricsFromBundle(bundle) : { openCount: 0, totalUnreal: 0 };
    const ledger = computeLedgerPerformanceFromHistory(history);
    const paperOperational = getPaperOperational(bundle);
    const assetDisplayKrw = coerceFinite(paperOperational?.current_asset_display_krw);
    const assetDisplayLabel = typeof paperOperational?.current_asset_display_label === "string" ? paperOperational.current_asset_display_label : "";
    const assetDisplaySource = typeof paperOperational?.current_asset_display_source === "string" ? paperOperational.current_asset_display_source : "";
    const paperEquityRefKrw = coerceFinite(paperOperational?.paper_equity_reference_krw);

    const bRecFull = bundle as Record<string, unknown>;
    const lastApiMs = lastUpdated.getTime();
    const maxV2Ts = maxSymbolAuditTs(bRecFull, SYMBOL_ORDER);
    const genAt = typeof bundle.generatedAt === "number" && Number.isFinite(bundle.generatedAt) ? bundle.generatedAt : null;
    const noEntryBy = bundle.noEntryAuditBySymbol;
    const auditKeys =
        noEntryBy && typeof noEntryBy === "object" ? Object.keys(noEntryBy).length : 0;
    const sourceLabel =
        assetDisplaySource === "okx_live_wallet"
            ? "OKX 실잔고 기준"
            : assetDisplaySource === "paper_config"
                ? "Paper 기준"
                : "내부 추정값";

    const okx = (bundle.dashboard as any)?.okx_balance;
    const isOkxLive = okx?.okx_balance_source === "okx_live_wallet" && okx?.okx_balance_fresh === true;

    // 1번 카드: 현재 평가 자산 (OKX 실계좌 우선)
    let mainAssetDisplay = "-";
    let mainAssetSub = "내부 추정값";
    let mainAssetSmallSub = "";
    
    if (isOkxLive) {
        const eq = coerceFinite(okx.okx_total_equity_usdt);
        if (eq !== null) {
            mainAssetDisplay = `${eq.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
            const krwApprox = Math.floor(eq * USDKRW_RATE);
            mainAssetSub = `약 ${formatKrw(krwApprox)} · OKX 실계좌`;
            if (okx.okx_balance_error === "AVAILABLE_FIELD_FALLBACK_USED") {
                mainAssetSmallSub = "가용잔고: availBal 기준";
            }
        }
    } else {
        // Fallback to internal estimate
        if (assetDisplayKrw !== null) {
            mainAssetDisplay = formatKrw(assetDisplayKrw);
            mainAssetSub = "Paper 추정값 (실계좌 미연결)";
        }
    }

    // 2번 카드: 누적 실현 손익 (OKX 실거래 기준)
    // 아직 OKX 실거래 데이터가 없으므로 0으로 고정하거나 live 필드 확인
    const liveRealizedPnl = coerceFinite(okx?.okx_live_realized_pnl_usdt) ?? 0;
    const liveClosedCount = coerceFinite(okx?.okx_live_closed_trade_count) ?? 0;
    
    const mainRealizedDisplay = `${liveRealizedPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
    const mainRealizedSub = liveClosedCount > 0 ? "OKX 실거래 기준" : "OKX 실거래 기준 · 아직 청산 거래 없음";
    const mainRealizedClass = liveRealizedPnl >= 0 ? "text-emerald-600" : "text-rose-600";

    // 4번 카드: 현재 미실현 손익 (OKX 실시간)
    let mainUnrealDisplay = "0.00 USDT";
    let mainUnrealSub = "OKX 실시간";
    let mainUnrealVal = 0;

    if (isOkxLive) {
        const u = coerceFinite(okx.okx_unrealized_pnl_usdt);
        if (u !== null) {
            mainUnrealVal = u;
            mainUnrealDisplay = `${u >= 0 ? "+" : "−"}${Math.abs(u).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
            const krwApprox = Math.floor(Math.abs(u) * USDKRW_RATE);
            mainUnrealSub = `약 ${u >= 0 ? "+" : "−"}${formatKrw(krwApprox)} · OKX 실시간`;
        }
    } else {
        mainUnrealVal = pm.totalUnreal;
        mainUnrealDisplay = toSignedMainKrwSubUsd(pm.totalUnreal, USDKRW_RATE).krw;
        mainUnrealSub = `${pm.openCount}건 운용 중 (Paper)`;
    }


    return (
        <div className="min-h-screen bg-[#F5F7FA] text-slate-800" lang="ko" translate="no">
            <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-900">운영 모니터</h1>
                            <p className="text-xs font-medium text-slate-400">자동매매 상태 · 자산 · 포지션 현황</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                마지막 API 갱신 수신
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                                {formatDateTimeKstNumeric(lastApiMs)}
                                {isRefreshing && <span className="ml-2 animate-pulse text-amber-500">...</span>}
                            </p>
                        </div>
                        <div className="h-8 w-[1px] bg-slate-100" />
                        <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 border border-slate-100">
                            <div className={`h-1.5 w-1.5 rounded-full ${isRefreshing ? "animate-ping bg-amber-400" : "bg-emerald-500"}`} />
                            <span className="text-[10px] font-bold text-slate-500">5초 주기</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl space-y-10 px-4 py-8">
                {err && (
                    <div className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
                        <span>{err}</span>
                        <button onClick={() => refreshData()} className="font-bold underline decoration-rose-200 underline-offset-2">재시도</button>
                    </div>
                )}

                {bundle?.configured ? (
                    <>
                        <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                시간 · 데이터 정합성
                            </h2>
                            <div className="mt-3 grid gap-y-2 sm:grid-cols-2 sm:gap-x-6">
                                <div className="space-y-1">
                                    <p className="font-bold text-slate-500">현재 시각</p>
                                    <p className="font-mono font-semibold text-slate-900">
                                        현재 KST: {formatDateTimeKstNumeric(clientNowMs)}
                                    </p>
                                </div>
                                <div className="space-y-1 border-t border-slate-100 pt-2 sm:border-t-0 sm:pt-0">
                                    <p className="font-bold text-slate-500">데이터 상태</p>
                                    <p className="text-slate-700">
                                        마지막 API 갱신:{" "}
                                        <span className="font-mono font-medium">{formatDateTimeKstNumeric(lastApiMs)}</span>
                                    </p>
                                    <p className="text-slate-600">
                                        API 수신 경과: {formatRelativeAgeKo(Math.max(0, clientNowMs - lastApiMs))}
                                    </p>
                                    <p className="text-slate-700">
                                        마지막 V2 판단(BTC·ETH 스냅샷 최대):{" "}
                                        <span className="font-mono font-medium">
                                            {maxV2Ts !== null ? formatDateTimeKstNumeric(maxV2Ts) : "기록 없음"}
                                        </span>
                                    </p>
                                    <p className="text-slate-600">
                                        V2 판단 데이터 나이:{" "}
                                        {maxV2Ts !== null
                                            ? formatRelativeAgeKo(Math.max(0, clientNowMs - maxV2Ts))
                                            : "—"}
                                    </p>
                                    {genAt !== null && (
                                        <p className="text-[11px] text-slate-400">
                                            참고 서버 번들 generatedAt: {formatDateTimeKstNumeric(genAt)} · 경과{" "}
                                            {formatRelativeAgeKo(Math.max(0, clientNowMs - genAt))}
                                        </p>
                                    )}
                                    {auditKeys === 0 && (
                                        <p className="rounded-md border border-rose-100 bg-rose-50 px-2 py-1 font-medium text-rose-900">
                                            무진입 감사 데이터 없음 — 응답에 noEntryAuditBySymbol이 없습니다.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* 1. 운영 제어 */}
                        <OperatorControlSection
                            bundle={bundle}
                            onAction={handleControlAction}
                            isProcessing={isProcessingControl}
                        />

                        {/* 2. 핵심 요약 */}
                        <section className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                <HeroMetric
                                    label="현재 평가 자산"
                                    value={mainAssetDisplay}
                                    subValue={mainAssetSub}
                                    smallSubValue={mainAssetSmallSub}
                                    valueClass="text-slate-900"
                                />
                                <HeroMetric
                                    label="누적 실현 손익"
                                    value={mainRealizedDisplay}
                                    subValue={mainRealizedSub}
                                    valueClass={mainRealizedClass}
                                />
                                <HeroMetric
                                    label="Paper 기준 자산"
                                    value={paperEquityRefKrw !== null ? formatKrw(paperEquityRefKrw) : "기록 없음"}
                                    subValue="실계좌가 아닌 Paper 성과 기준값"
                                    valueClass="text-slate-700"
                                />
                                 <HeroMetric
                                    label="현재 미실현 손익"
                                    value={mainUnrealDisplay}
                                    subValue={mainUnrealSub}
                                    valueClass={mainUnrealVal >= 0 ? "text-emerald-600" : "text-rose-600"}
                                />
                            </div>

                            {isOkxLive && (
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                    <MetricCell 
                                        label="실 사용 가능 잔고" 
                                        value={`${coerceFinite(okx.okx_available_balance_usdt)?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
                                        className="bg-emerald-50/30 border-emerald-100"
                                    />
                                    <MetricCell 
                                        label="사용 중 증거금" 
                                        value={`${coerceFinite(okx.okx_margin_used_usdt)?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
                                        className="bg-amber-50/30 border-amber-100"
                                    />
                                </div>
                            )}
                        </section>

                        {/* 3. 현재 포지션 */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">현재 포지션</h2>
                                <button
                                    onClick={() => setShowInternalTags(!showInternalTags)}
                                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline underline-offset-4 decoration-slate-200"
                                >
                                    {showInternalTags ? "상세 정보 숨기기" : "상세 정보 표시"}
                                </button>
                            </div>
                            <div className="space-y-3">
                                {positionSlots.length === 0 ? (
                                    <div className="flex flex-col h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/50 text-center">
                                        <p className="text-xs font-bold text-slate-400">보유 포지션 없음</p>
                                    </div>
                                ) : (
                                    positionSlots.map((slot, i) => {
                                        const sym = slot.pos.symbol;
                                        const auditRow = pickNoEntryAuditRow(bundle as any, sym);
                                        const candidateDirection = auditRow ? formatSideCandidateEn(auditRow.trend_side_candidate) : null;
                                        const htfBias = auditRow ? (auditRow.htf_1d_bias ?? auditRow.htf_4h_bias ?? auditRow.htf_1h_bias ?? null) : null;
                                        const nextAction = auditRow ? String(auditRow.expected_next_action ?? "") : null;
                                        const noEntryReason = auditRow ? String(auditRow.expected_missing_condition ?? "") : null;
                                        const okxSide = slot.okxActual 
                                            ? String(slot.okxActual.side ?? slot.okxActual.posSide ?? "").toLowerCase() 
                                            : String(slot.pos.side ?? "").toLowerCase();

                                        let severity: "conflict" | "warning" | "none" = "none";
                                        let message = "";
                                        const sideLower = okxSide.toLowerCase();
                                        const candLower = candidateDirection ? candidateDirection.toLowerCase() : null;
                                        const htfLower = htfBias ? htfBias.toLowerCase() : null;

                                        if (sideLower === "long" || sideLower === "buy") {
                                            if (candLower === "short") {
                                                severity = "conflict";
                                                message = "OKX 실제 포지션은 Long 보유 중이나, 현재 시장판단은 Short 우세입니다.";
                                            } else if (htfLower === "bearish") {
                                                severity = "warning";
                                                message = "OKX 실제 포지션은 Long 보유 중이나, 현재 시장판단은 Bearish 우세입니다.";
                                            }
                                        } else if (sideLower === "short" || sideLower === "sell") {
                                            if (candLower === "long") {
                                                severity = "conflict";
                                                message = "OKX 실제 포지션은 Short 보유 중이나, 현재 시장판단은 Long 우세입니다.";
                                            } else if (htfLower === "bullish") {
                                                severity = "warning";
                                                message = "OKX 실제 포지션은 Short 보유 중이나, 현재 시장판단은 Bullish 우세입니다.";
                                            }
                                        }

                                        const conflictInfo = {
                                            okxSide: sideLower === "short" ? "Short" : "Long",
                                            htfBias,
                                            candidateDirection,
                                            severity,
                                            message,
                                            nextAction,
                                            noEntryReason,
                                            htf_5m_bias: auditRow ? auditRow.htf_5m_bias : null,
                                            htf_15m_bias: auditRow ? auditRow.htf_15m_bias : null,
                                            htf_1h_bias: auditRow ? auditRow.htf_1h_bias : null,
                                            htf_4h_bias: auditRow ? auditRow.htf_4h_bias : null,
                                            htf_1d_bias: auditRow ? auditRow.htf_1d_bias : null,
                                            sideVetoDetail: auditRow ? String(auditRow.side_veto_detail ?? "") : null,
                                        };

                                        return (
                                            <PositionMoneyCard
                                                key={i}
                                                pos={slot.pos}
                                                row={bundle.symbolRows?.find((r) => r.symbol === slot.pos.symbol)}
                                                symbolDecisions={symbolDecisions}
                                                showInternalTags={showInternalTags}
                                                exchangeDiagnosticBadge={slot.exchangeDiagnosticBadge}
                                                exchangeStatusHeadline={slot.exchangeStatusHeadline}
                                                manualInterventionSuspected={slot.manualInterventionSuspected}
                                                syncMismatchDetected={slot.syncMismatchDetected}
                                                okxActual={slot.okxActual}
                                                conflictInfo={conflictInfo}
                                            />
                                        );
                                    })
                                )}
                            </div>
                        </section>

                        {/* 4. 자산별 상태 */}
                        <section className="space-y-4">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">자산별 상태</h2>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {SYMBOL_ORDER.map((sym) => {
                                    const row =
                                        bundle.symbolRows.find((r) => r.symbol === sym) ??
                                        ({ symbol: sym, signal: "none" } as Record<string, unknown>);
                                    const hasPos = positionSlots.some((s) => String(s.pos.symbol) === sym);
                                    return (
                                        <SymbolStatusCard
                                            key={sym}
                                            bundle={bundle}
                                            row={row}
                                            symbolDecisions={symbolDecisions}
                                            showInternalTags={showInternalTags}
                                            hasPosition={hasPos}
                                            clientNowMs={clientNowMs}
                                            positionSlots={positionSlots}
                                        />
                                    );
                                })}
                            </div>
                        </section>

                        {/* 5. 최근 종료 거래 */}
                        <LastClosedSummaryCard trade={lastClosed} />

                        {/* 6. 최근 거래 현황 */}
                        <RecentPerformanceSection perf={perf} history={history} />

                        {/* 7. 상세 상태 접기 영역 */}
                        <details className="group mt-10 overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-2">
                                    상세 상태
                                </div>
                                <span className="text-[10px] text-slate-300 transition-transform group-open:rotate-180">▲</span>
                            </summary>
                            <div className="space-y-6 border-t border-slate-100 p-6">
                                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                                    <MetricCell label="장세" value={String(curRegime || "-")} valueClass="text-amber-700" />
                                    <MetricCell label="모드" value={String(executor || "-")} />
                                    <MetricCell label="리스크" value={String(riskState || "-")} />
                                    <MetricCell label="엔진" value={String((bundle?.engineState as any)?.engine_status || "-")} />
                                </div>
                            </div>
                        </details>
                    </>
                ) : (
                    <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-center shadow-sm">
                        <p className="text-sm font-bold text-slate-400">데이터가 초기화되지 않았습니다.</p>
                        <p className="text-xs text-slate-300 mt-2">{bundle.configHint || "시스템 설정을 확인하십시오."}</p>
                    </div>
                )}
            </main>
        </div>
    );
}
