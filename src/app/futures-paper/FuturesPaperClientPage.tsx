"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
    formatChanged,
    formatCount,
    formatCurrencyUsd,
    formatDateTimeKst,
    formatDateTimeKstShort,
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
    INITIAL_CAPITAL_USD
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
    eventsRecent?: Array<Record<string, unknown>>;
    positionsHistory?: Array<Record<string, any>>;
    // Control states
    serverTradeEnabled?: boolean;
    closeOnlyMode?: boolean;
    killSwitch?: boolean;
    trade_control_updated_at?: number;
    trade_control_source?: string;
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

function aggregatePortfolioMetricsFromBundle(bundle: Bundle) {
    const opens = Array.isArray(bundle.openPositions) ? bundle.openPositions : [];
    const eng = bundle.engineState;
    const symDec =
        eng && typeof eng === "object"
            ? ((eng as Record<string, unknown>).symbol_decisions as
                | Record<string, { decision?: Record<string, unknown> }>
                | undefined)
            : undefined;
    let totalUnreal = 0;
    for (const o of opens) {
        const n = normalizeOpenPos(o as Record<string, unknown>);
        if (!n) continue;
        const sym = String((o as Record<string, unknown>).symbol ?? "");
        const row = bundle.symbolRows?.find((r) => String(r.symbol) === sym);
        const dec = symDec?.[sym]?.decision;
        const mark = markForPosition(o as Record<string, unknown>, row, dec ?? null);
        const u = unrealizedUsdResolved(n, mark);
        if (typeof u === "number" && Number.isFinite(u)) totalUnreal += u;
    }
    return { openCount: opens.length, totalUnreal };
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

/** Components */

function HeroMetric({
    label,
    value,
    subValue,
    valueClass
}: {
    label: string;
    value: string;
    subValue?: string;
    valueClass?: string;
}) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className={`text-2xl font-black tabular-nums tracking-tighter sm:text-3xl ${valueClass ?? "text-slate-900"}`}>
                {value}
            </p>
            {subValue && <p className="mt-1 text-[11px] font-bold text-slate-400">{subValue}</p>}
            <p className="mt-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-300">{label}</p>
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

function PositionMoneyCard({
    pos,
    row,
    symbolDecisions,
    showInternalTags
}: {
    pos: Record<string, unknown>;
    row: Record<string, unknown> | undefined;
    symbolDecisions: Record<string, unknown> | null;
    showInternalTags: boolean;
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
    const side = pos.side === "short" ? "Short" : "Long";

    const stopDisplay =
        n?.stopPx !== null && n?.stopPx !== undefined && Number.isFinite(n.stopPx!)
            ? formatPrice(n.stopPx)
            : "-";

    const entryDisp = n?.entryPrice !== null && n?.entryPrice !== undefined ? formatPrice(n.entryPrice) : "-";
    const markDisp = mark !== null ? formatPrice(mark) : "-";

    const pe = coerceFinite(pos.partialExitStage);
    const exitProg =
        typeof pe === "number" && Number.isFinite(pe) ? `${Math.max(0, Math.min(3, Math.floor(pe)))}/3` : "-";

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-bold text-slate-800 notranslate" translate="no">{sym}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${pos.side === "short" ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"}`}>
                        {side}
                    </span>
                    <span className="text-xs font-medium text-slate-400">· {hold}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">현재 상태:</span>
                    <span className="text-xs font-bold text-slate-600">{dec?.guidance ? String(dec.guidance) : "유지"}</span>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCell label="진입가" value={entryDisp} />
                <MetricCell label="현재가" value={markDisp} valueClass="text-amber-700" />
                <MetricCell label="손익" value={uPnL !== null ? toSignedMainKrwSubUsd(uPnL, USDKRW_RATE).krw : "-"} valueClass={uClass} />
                <MetricCell label="수익률" value={uPct} valueClass={uClass} />
                <MetricCell label="손절가" value={stopDisplay} valueClass="text-rose-500" />
            </div>

            {showInternalTags && (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                         <MetricCell label="진입금액" value={notionalUsd !== null ? toMainKrwSubUsd(notionalUsd, USDKRW_RATE).krw : "-"} />
                         <MetricCell label="증거금" value={marginUsd !== null ? toMainKrwSubUsd(marginUsd, USDKRW_RATE).krw : "-"} />
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

function SymbolStatusCard({
    row,
    symbolDecisions,
    showInternalTags,
    hasPosition
}: {
    row: Record<string, unknown>;
    symbolDecisions: Record<string, unknown> | null;
    showInternalTags: boolean;
    hasPosition: boolean;
}) {
    const sym = String(row.symbol);
    const symbolData = (symbolDecisions as Record<string, any> | null)?.[sym];
    const rep = getRepresentativeStatus(row, symbolData, hasPosition);

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="font-mono text-lg font-bold text-slate-800 notranslate" translate="no">{sym}</div>
                <div
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${rep.label === "포지션 보유 중" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                        rep.label === "진입 검토 중" ? "bg-amber-50 text-amber-600 border-amber-100" :
                            "bg-slate-50 text-slate-400 border-slate-100"
                        }`}
                >
                    {rep.label}
                </div>
            </div>

            <div className="mt-4 space-y-1">
                <p className="text-sm font-bold text-slate-700">{rep.label}</p>
                <p className="text-xs font-medium text-slate-400">{rep.reason}</p>
            </div>

            {showInternalTags && (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">데이터 정보</p>
                            <p className="mt-0.5 text-xs font-medium text-slate-600">{describeSnapshotContext(row)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">마지막 업데이트</p>
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
                            <p className={`mt-1.5 text-sm font-bold ${tradeEnabled && !closeOnly && !killActive ? "text-emerald-600" : "text-rose-500"}`}>
                                {tradeEnabled && !closeOnly && !killActive ? "가능" : "차단"}
                            </p>
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

    const openPositions = Array.isArray(bundle?.openPositions) ? (bundle.openPositions as any[]) : [];
    const symbolDecisions = (engine as any)?.symbol_decisions ?? null;

    const pm = bundle ? aggregatePortfolioMetricsFromBundle(bundle) : { openCount: 0, totalUnreal: 0 };
    const ledger = computeLedgerPerformanceFromHistory(history);

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
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">마지막 갱신</p>
                            <p className="text-xs font-medium text-slate-500">
                                {formatDateTimeKstShort(lastUpdated.getTime())}
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
                        {/* 1. 운영 제어 */}
                        <OperatorControlSection
                            bundle={bundle}
                            onAction={handleControlAction}
                            isProcessing={isProcessingControl}
                        />

                        {/* 2. 핵심 요약 */}
                        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <HeroMetric
                                label="현재 평가 자산"
                                value={formatKrw(ledger.currentCapitalKrw)}
                                subValue={`상방 ${formatChanged(ledger.currentCapitalKrw - ledger.initialCapitalKrw)}`}
                                valueClass="text-slate-900"
                            />
                            <HeroMetric
                                label="누적 실현 손익"
                                value={toSignedMainKrwSubUsd(ledger.totalRealizedPnlUsd, USDKRW_RATE).krw}
                                subValue={`ROI ${formatPercent(ledger.roiPct)}`}
                                valueClass={ledger.totalRealizedPnlUsd >= 0 ? "text-emerald-600" : "text-rose-600"}
                            />
                            <HeroMetric
                                label="현재 미실현 손익"
                                value={toSignedMainKrwSubUsd(pm.totalUnreal, USDKRW_RATE).krw}
                                subValue={`${pm.openCount}건 운용 중`}
                                valueClass={pm.totalUnreal >= 0 ? "text-emerald-600" : "text-rose-600"}
                            />
                             <HeroMetric
                                label="종료 거래 건수"
                                value={formatCount(ledger.totalTrades)}
                                subValue="전체 기간 합산"
                                valueClass="text-slate-600"
                            />
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
                                {openPositions.length === 0 ? (
                                    <div className="flex flex-col h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/50 text-center">
                                        <p className="text-xs font-bold text-slate-400">보유 포지션 없음</p>
                                    </div>
                                ) : (
                                    openPositions.map((p, i) => (
                                        <PositionMoneyCard
                                            key={i}
                                            pos={p}
                                            row={bundle.symbolRows?.find((r) => r.symbol === p.symbol)}
                                            symbolDecisions={symbolDecisions}
                                            showInternalTags={showInternalTags}
                                        />
                                    ))
                                )}
                            </div>
                        </section>

                        {/* 4. 자산별 상태 */}
                        <section className="space-y-4">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">자산별 상태</h2>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {SYMBOL_ORDER.map((sym) => {
                                    const row = bundle.symbolRows.find((r) => r.symbol === sym);
                                    if (!row) return null;
                                    const hasPos = openPositions.some((p) => p.symbol === sym);
                                    return (
                                        <SymbolStatusCard
                                            key={sym}
                                            row={row}
                                            symbolDecisions={symbolDecisions}
                                            showInternalTags={showInternalTags}
                                            hasPosition={hasPos}
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
