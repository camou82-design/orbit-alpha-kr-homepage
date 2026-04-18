"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
    formatChanged,
    formatCount,
    formatCurrencyUsd,
    formatDateTimeKst,
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
};

type NormPos = {
    margin: number | null;
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

function entryMarginUsd(pos: Record<string, unknown>): number | null {
    const a = coerceFinite(pos.sizeUsd);
    if (a !== null && a > 0) return a;
    const b = coerceFinite(pos.initialSizeUsd);
    if (b !== null && b > 0) return b;
    return null;
}

function normalizeOpenPos(pos: Record<string, unknown>): NormPos | null {
    if (!pos || typeof pos !== "object") return null;
    const opened =
        coerceFinite(pos.openedAt) ?? coerceFinite(pos.firstOpenedAt);
    return {
        margin: entryMarginUsd(pos),
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
    if (n.unrealPct !== null && n.margin !== null && n.margin > 0) return (n.margin * n.unrealPct) / 100;
    if (
        mark === null ||
        n.entryPrice === null ||
        n.entryPrice <= 0 ||
        n.margin === null ||
        n.margin <= 0
    )
        return null;
    const lev = n.leverage;
    const gross =
        side === "long"
            ? ((mark - n.entryPrice) / n.entryPrice) * n.margin * lev
            : ((n.entryPrice - mark) / n.entryPrice) * n.margin * lev;
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 ring-1 ring-zinc-800/50 shadow-lg">
            <p className={`text-3xl font-black tabular-nums tracking-tighter sm:text-4xl ${valueClass ?? "text-zinc-100"}`}>
                {value}
            </p>
            {subValue && <p className="mt-1 text-sm font-medium text-zinc-400">{subValue}</p>}
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
        </div>
    );
}

function AccountOverviewSection({
    pm,
    perf,
    usdkrwRate,
    ledger
}: {
    pm: { openCount: number, totalUnreal: number },
    perf: LedgerPerformance | null,
    usdkrwRate: number,
    ledger: any
}) {
    const totalAssetsKrw = ledger.currentCapitalKrw;
    const totalAssetsUsdt = ledger.currentCapitalUsd;

    return (
        <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">계좌 개요 (Account Overview)</h2>
            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">현재 자산 (Current)</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-zinc-100">{formatKrw(totalAssetsKrw)}</span>
                        <span className="text-sm font-medium text-zinc-400">≈ {formatCurrencyUsd(totalAssetsUsdt)}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-zinc-600">기준 환율: 1 USDT ≈ {formatKrw(usdkrwRate)}</p>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">초기 자산 (Initial)</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-zinc-400">{formatKrw(ledger.initialCapitalKrw)}</span>
                        <span className="text-sm font-medium text-zinc-400">≈ {formatCurrencyUsd(ledger.initialCapitalUsd)}</span>
                    </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">누적 실현 성과 (Net)</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className={`text-2xl font-black ${ledger.totalRealizedPnlUsd >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {formatUsdSignified(ledger.totalRealizedPnlUsd)}
                        </span>
                        <span className={`text-sm font-medium ${ledger.roiPct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            ({formatPercent(ledger.roiPct, "0%")} ROI)
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
}

function ExposureSection({
    openPositions,
    totalCapitalUsdt
}: {
    openPositions: any[],
    totalCapitalUsdt: number
}) {
    const totalExposureUsdt = openPositions.reduce((acc, p) => acc + (coerceFinite(p.sizeUsd) || coerceFinite(p.initialSizeUsd) || 0), 0);
    const exposurePct = (totalExposureUsdt / totalCapitalUsdt) * 100;

    return (
        <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">포지션 비중 / 노출</h2>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">총 노출 비중</p>
                    <p className="text-sm font-black text-amber-400">{exposurePct.toFixed(1)}%</p>
                </div>
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                    {openPositions.map((p, i) => {
                        const margin = coerceFinite(p.sizeUsd) || coerceFinite(p.initialSizeUsd) || 0;
                        const pct = (margin / totalCapitalUsdt) * 100;
                        return (
                            <div
                                key={i}
                                style={{ width: `${pct}%` }}
                                className={`${p.symbol === "BTCUSDT" ? "bg-amber-500" : "bg-blue-500"} h-full border-r border-zinc-900`}
                                title={`${p.symbol}: ${pct.toFixed(1)}%`}
                            />
                        );
                    })}
                </div>
                <div className="mt-4 flex gap-6">
                    {["BTCUSDT", "ETHUSDT"].map(sym => {
                        const p = openPositions.find(x => x.symbol === sym);
                        const margin = p ? (coerceFinite(p.sizeUsd) || coerceFinite(p.initialSizeUsd) || 0) : 0;
                        const pct = (margin / totalCapitalUsdt) * 100;
                        return (
                            <div key={sym} className="flex items-center gap-2">
                                <div className={`h-2 w-2 rounded-full ${sym === "BTCUSDT" ? "bg-amber-500" : "bg-blue-500"}`} />
                                <span className="text-[10px] font-bold text-zinc-400">{sym}</span>
                                <span className="text-xs font-mono text-zinc-200">{pct.toFixed(1)}%</span>
                            </div>
                        );
                    })}
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-zinc-800" />
                        <span className="text-[10px] font-bold text-zinc-400">IDLE CAPITAL</span>
                        <span className="text-xs font-mono text-zinc-500">{(100 - exposurePct).toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        </section>
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
        <div className={`rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 transition-all hover:bg-zinc-900/40 ${className || ""}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
            <p className={`mt-2 font-mono text-base font-black ${valueClass || "text-zinc-100"}`}>
                {value}
            </p>
        </div>
    );
}

function StageProgress({ current, total, colorClass, label }: { current: number; total: number; colorClass: string; label: string }) {
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                <span>{label}</span>
                <span>{current}/{total}</span>
            </div>
            <div className="flex gap-1.5">
                {Array.from({ length: total }).map((_, i) => (
                    <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i < current ? colorClass : "bg-zinc-800"}`}
                    />
                ))}
            </div>
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
            reason: `${authoritySide.toUpperCase()} 방향 진입 조건이 충족됨`
        };
    }

    if (adoptionReason === "legacy_mode_forced" && v2Decision === "ENTER" && v2Side && v2Side !== "none") {
        return {
            label: "레거시 우선 대기",
            reason: `V2는 ${v2Side.toUpperCase()} 진입 신호지만 현재 서버는 legacy 강제 모드라 보류 중`
        };
    }

    if (v2Decision === "HOLD") {
        return {
            label: "재확인 대기",
            reason: "V2 기준 아직 방향 확정 전이라 한 틱 더 확인 중"
        };
    }

    if (v2Decision === "SKIP" && selectorMismatch) {
        return {
            label: "판단 불일치 대기",
            reason: "V1/V2 판단이 엇갈려 현재 채택 엔진 기준으로 대기 중"
        };
    }

    if (v1Decision === "SKIP" && (v1Side === "none" || !v1Side)) {
        return {
            label: "신호 대기",
            reason: "현재 채택 엔진 기준 유효 진입 방향이 없음"
        };
    }

    return {
        label: "대기 중",
        reason: "현재 진입 조건이 충분히 확인되지 않아 관망 중"
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
    const margin = n?.margin ?? null;
    const equityUsd = margin !== null && uPnL !== null ? margin + uPnL : null;
    const uPct = formatPctOnMargin(uPnL, margin);
    const hold = formatHoldShort(n?.openedAt ?? null);
    const uClass =
        uPnL === null ? "text-zinc-300" : uPnL >= 0 ? "text-emerald-400" : "text-rose-400";
    const side = pos.side === "short" ? "숏" : "롱";

    const stopDisplay =
        n?.stopPx !== null && n?.stopPx !== undefined && Number.isFinite(n.stopPx!)
            ? formatPrice(n.stopPx)
            : "미설정";

    const entryDisp = n?.entryPrice !== null && n?.entryPrice !== undefined ? formatPrice(n.entryPrice) : "기록 없음";
    const markDisp = mark !== null ? formatPrice(mark) : "기록 없음";

    const pe = coerceFinite(pos.partialExitStage);
    const exitProg =
        typeof pe === "number" && Number.isFinite(pe) ? `${Math.max(0, Math.min(3, Math.floor(pe)))}/3` : "기록 없음";

    const marginStr = margin !== null ? formatCurrencyUsd(margin) : "기록 없음";
    const equityStr = equityUsd !== null ? formatCurrencyUsd(equityUsd) : "기록 없음";

    return (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/5 p-5 shadow-[0_0_20px_rgba(16,185,129,0.05)] ring-1 ring-emerald-500/10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="font-mono text-xl font-black flex items-center gap-3">
                    <span className="text-zinc-100">{sym}</span>
                    <span className={`rounded-md px-2 py-0.5 text-xs ring-1 ${pos.side === "short" ? "bg-rose-950/30 text-rose-400 ring-rose-500/40" : "bg-emerald-950/30 text-emerald-400 ring-emerald-500/40"}`}>
                        {side}
                    </span>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <MetricCell label="진입금액 (Margin)" value={marginStr} />
                <MetricCell label="평가금액 (Equity)" value={equityStr} />
                <MetricCell label="비중 (Weight %)" value={margin !== null ? ((margin / INITIAL_CAPITAL_USD) * 100).toFixed(1) + "%" : "기록 없음"} valueClass="text-amber-400/90" />
                <MetricCell label="미실현 손익" value={formatSignedUsdDisplay(uPnL)} valueClass={uClass} />
                <MetricCell label="수익률 %" value={uPct} valueClass={uClass} />
                <MetricCell label="보유시간" value={hold} className="col-span-2 sm:col-span-1 lg:col-span-1" />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-zinc-800/50 pt-5 text-sm sm:grid-cols-3 lg:grid-cols-5">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">평균 진입가</p>
                    <p className="mt-1 font-mono tabular-nums text-zinc-200">{entryDisp}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">현재가 (MARK)</p>
                    <p className="mt-1 font-mono tabular-nums text-amber-200/90">{markDisp}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">익절 진행</p>
                    <p className="mt-1 font-mono tabular-nums text-emerald-400">{exitProg}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">손절가</p>
                    <p className="mt-1 font-mono tabular-nums text-rose-400">{stopDisplay}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">최초 진입</p>
                    <p className="mt-1 font-mono tabular-nums text-zinc-400 text-[11px] leading-tight">{formatDateTimeKst(coerceFinite(pos.openedAt))}</p>
                </div>
            </div>

            {showInternalTags && (
                <div className="mt-5 space-y-3 border-t border-zinc-800/50 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <StageProgress
                            current={(() => {
                                const r = coerceFinite(pos.entryStage);
                                return r !== null ? Math.min(3, Math.max(1, Math.floor(r))) : 1;
                            })()}
                            total={3}
                            colorClass="bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                            label="진입 단계"
                        />
                        <StageProgress
                            current={(() => {
                                const r = coerceFinite(pos.partialExitStage);
                                return r !== null ? Math.min(3, Math.max(0, Math.floor(r))) : 0;
                            })()}
                            total={3}
                            colorClass="bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]"
                            label="익절 단계"
                        />
                    </div>
                    <div className="rounded-md bg-zinc-900 px-3 py-2.5 ring-1 ring-zinc-800">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">현재 가이드</p>
                        <p className="mt-0.5 text-sm font-medium text-zinc-200">{dec?.guidance ? String(dec.guidance) : "관망 및 신호 대기"}</p>
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="font-mono text-xl font-black text-amber-200">{sym}</div>
                <div
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 transition-all ${rep.label === "포지션 보유 중" ? "bg-emerald-950/30 text-emerald-400 ring-emerald-500/50" :
                        rep.label === "진입 검토 중" ? "bg-amber-950/30 text-amber-400 ring-amber-500/50" :
                            "bg-zinc-800 text-zinc-400 ring-zinc-700"
                        }`}
                >
                    {rep.label}
                </div>
            </div>

            <div className="mt-5 space-y-1">
                <p className="text-base font-bold text-zinc-100">{rep.label}</p>
                <p className="text-sm font-medium text-zinc-400">{rep.reason}</p>
            </div>

            {showInternalTags && (
                <div className="mt-5 space-y-4 border-t border-zinc-800/50 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">방향 감지</p>
                            <p className="mt-0.5 text-xs font-medium text-zinc-200">{describeSnapshotContext(row)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">최근 업데이트</p>
                            <p className="mt-0.5 text-[10px] text-zinc-500">{formatDateTimeKst(row.fetchedAt)}</p>
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
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">최근 실적 및 종료 이력</h2>
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCell label="최근 24시간 손익" value={pnl24h !== null ? formatSignedUsdDisplay(pnl24h) : "기록 없음"} valueClass={pnl24h === null ? "" : pnl24h >= 0 ? "text-emerald-400" : "text-rose-400"} />
                <MetricCell label="최근 7일 손익" value={formatSignedUsdDisplay(w7?.totalPnlUsdNet ?? null)} valueClass={(w7?.totalPnlUsdNet ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"} />
                <MetricCell label="최근 30일 손익" value={formatSignedUsdDisplay(w30?.totalPnlUsdNet ?? null)} valueClass={(w30?.totalPnlUsdNet ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"} />
                <MetricCell label="최근 7일 승률" value={formatPercent(w7?.winRate ?? null)} />
                <MetricCell label="최근 종료 거래 수" value={formatCount(w7?.totalTrades ?? 0) + "건"} />
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/20">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-zinc-400">
                        <thead className="bg-zinc-900/80 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                            <tr>
                                <th className="px-5 py-3">종목</th>
                                <th className="px-5 py-3">방향</th>
                                <th className="px-5 py-3">진입가</th>
                                <th className="px-5 py-3">종료가</th>
                                <th className="px-5 py-3">실현 손익</th>
                                <th className="px-5 py-3">수익률</th>
                                <th className="px-5 py-3">종료 사유</th>
                                <th className="px-5 py-3 text-right">종료 시각</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/40">
                            {last5.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-5 py-10 text-center text-zinc-500 italic">
                                        최근 종료 거래 없음
                                    </td>
                                </tr>
                            ) : (
                                last5.map((t, i) => (
                                    <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="px-5 py-3.5 font-mono font-bold text-zinc-100">{t.symbol}</td>
                                        <td className="px-5 py-3.5">
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.side === "short" ? "bg-rose-950/30 text-rose-400 ring-1 ring-rose-500/30" : "bg-emerald-950/30 text-emerald-400 ring-1 ring-emerald-500/30"}`}>
                                                {t.side === "short" ? "숏" : "롱"}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 font-mono text-zinc-300">{formatPrice(t.entryPrice)}</td>
                                        <td className="px-5 py-3.5 font-mono text-zinc-300">{formatPrice(t.exitPrice)}</td>
                                        <td className={`px-5 py-3.5 font-mono font-bold ${(t.pnlUsdNet || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                            {formatSignedUsdDisplay(t.pnlUsdNet)}
                                        </td>
                                        <td className={`px-5 py-3.5 font-mono font-bold ${(t.pnlUsdNet || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                            {t.pnlUsdNet !== null && t.initialSizeUsd ? formatPctOnMargin(t.pnlUsdNet, t.initialSizeUsd) : "기록 없음"}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {(() => {
                                                const { label, desc, code } = formatExitReason(t.exitType || t.exitReason);
                                                return (
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-zinc-100">{label}</span>
                                                        <span className="text-[10px] text-zinc-500">{desc} ({code})</span>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-5 py-3.5 text-right text-[10px] text-zinc-500">{formatDateTimeKst(t.closedAt)}</td>
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
    const pnlClass = (trade.pnlUsdNet ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400";
    const holdMin = trade.closedAt && trade.openedAt ? Math.floor((trade.closedAt - trade.openedAt) / 60000) : null;

    return (
        <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">직전 종료 요약</h2>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 ring-1 ring-zinc-800/50 shadow-lg" >
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="font-mono text-lg font-black text-zinc-100">{trade.symbol}</div>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${trade.side === "short" ? "bg-rose-950/30 text-rose-400 ring-rose-500/30" : "bg-emerald-950/30 text-emerald-400 ring-emerald-500/30"}`}>
                            {trade.side === "short" ? "숏" : "롱"}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-x-8 gap-y-2">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">종료 사유</p>
                            {(() => {
                                const { label, desc, code } = formatExitReason(trade.exitType || trade.exitReason);
                                return (
                                    <div className="mt-1">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-sm font-bold text-zinc-100">{label}</span>
                                            <span className="text-[10px] text-zinc-500 uppercase">{code}</span>
                                        </div>
                                        <p className="text-[10px] text-zinc-400">{desc}</p>
                                    </div>
                                );
                            })()}
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">실현 손익</p>
                            <p className={`mt-1 font-mono text-sm font-black ${pnlClass}`}>{formatSignedUsdDisplay(trade.pnlUsdNet)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">종료 시각</p>
                            <p className="mt-1 font-mono text-xs text-zinc-400">{formatDateTimeKst(trade.closedAt)}</p>
                        </div>
                        {holdMin !== null && (
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">보유</p>
                                <p className="mt-1 text-xs font-medium text-zinc-300">{holdMin}분</p>
                            </div>
                        )}
                    </div>
                </div>
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
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <header className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-lg font-semibold tracking-tight">선물 페이퍼 모니터</h1>
                            <p className="text-xs text-zinc-500">Bybit USDT · 모의 · 읽기 전용</p>
                        </div>
                        <div className="hidden border-l border-zinc-700 pl-4 sm:block">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">마지막 갱신</p>
                            <p className="text-[10px] text-zinc-400">
                                {lastUpdated.toLocaleTimeString("ko-KR")}
                                {isRefreshing && <span className="ml-2 animate-pulse text-amber-400">갱신 중...</span>}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-full bg-zinc-800/50 px-3 py-1 ring-1 ring-zinc-700/50">
                            <div className={`h-1.5 w-1.5 rounded-full ${isRefreshing ? "animate-ping bg-amber-400" : "bg-emerald-500"}`} />
                            <span className="text-[10px] font-bold text-zinc-400">AUTO: 5s</span>
                        </div>
                        <Link href="/" className="text-sm text-amber-400/90 hover:text-amber-300">
                            ← orbitalpha.kr
                        </Link>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl space-y-12 px-4 py-8">
                {err && (
                    <div className="flex items-center justify-between rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                        <span>{err}</span>
                        <button onClick={() => refreshData()} className="rounded bg-red-900/40 px-3 py-1 text-[10px] font-bold hover:bg-red-800/60 transition-colors">재시도</button>
                    </div>
                )}

                {bundle?.configured ? (
                    <>
                        {/* ROW 1: Hero Metrics */}
                        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                            <HeroMetric
                                label="현재 운용자산 (Current)"
                                value={formatKrw(ledger.currentCapitalKrw)}
                                subValue={`≈ ${formatCurrencyUsd(ledger.currentCapitalUsd)}`}
                                valueClass="text-amber-400"
                            />
                            <HeroMetric
                                label="누적 실현손익 (Total Net)"
                                value={formatSignedUsdDisplay(ledger.totalRealizedPnlUsd)}
                                subValue={`${formatPercent(ledger.roiPct)} ROI`}
                                valueClass={ledger.totalRealizedPnlUsd >= 0 ? "text-emerald-400" : "text-rose-400"}
                            />
                            <HeroMetric
                                label="현재 미실현 손익 (Unreal)"
                                value={formatSignedUsdDisplay(pm.totalUnreal)}
                                valueClass={pm.totalUnreal >= 0 ? "text-emerald-400" : "text-rose-400"}
                            />
                            <HeroMetric label="보유 포지션 / 총 거래" value={`${pm.openCount}건 / ${formatCount(ledger.tradeCount)}건`} />
                        </section>

                        {/* ROW 2: Account Overview */}
                        <AccountOverviewSection pm={pm} perf={perf} usdkrwRate={USDKRW_RATE} ledger={ledger} />

                        {/* ROW 3: Current Positions */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">현재 포지션 (Current Positions)</h2>
                                <button
                                    onClick={() => setShowInternalTags(!showInternalTags)}
                                    className="rounded bg-zinc-800 px-3 py-1.5 text-[10px] font-bold text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                                >
                                    {showInternalTags ? "Detail View On" : "Detail View Off"}
                                </button>
                            </div>
                            <div className="space-y-4">
                                {openPositions.length === 0 ? (
                                    <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 text-sm italic text-zinc-600">
                                        현재 열려 있는 포지션이 없습니다.
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

                        {/* ROW 4: Symbol Status Cards */}
                        <section className="space-y-4">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">종목별 현재 상태</h2>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
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

                        {/* ROW 5: Exposure / Weight */}
                        {openPositions.length > 0 && (
                            <ExposureSection openPositions={openPositions} totalCapitalUsdt={ledger.currentCapitalUsd} />
                        )}

                        {/* ROW 6: Last Closed Summary */}
                        <LastClosedSummaryCard trade={lastClosed} />

                        {/* ROW 7: Recent Performance & History */}
                        <RecentPerformanceSection perf={perf} history={history} />

                        {/* BOTTOM: Operator / Developer Details */}
                        <details className="group mt-12 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/10">
                            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 text-xs font-bold uppercase tracking-widest text-zinc-500 transition-colors hover:bg-zinc-800/30">
                                <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500/50" />
                                    운영자 / 개발자용 상세 실시간 분석
                                </div>
                                <span className="text-[10px] text-zinc-600 transition-transform group-open:rotate-180">▲</span>
                            </summary>
                            <div className="space-y-8 border-t border-zinc-800/50 p-6">
                                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                                    <MetricCell label="현재 레짐 (Regime)" value={String(curRegime || "기록 없음")} valueClass="text-amber-200" />
                                    <MetricCell label="실행기 (Executor)" value={String(executor || "기록 없음")} />
                                    <MetricCell label="위험 상태 (Risk)" value={String(riskState || "기록 없음")} />
                                    <MetricCell label="엔진 상태 (Status)" value={String(bundle?.engineState?.engine_status || "기록 없음")} />
                                </div>
                            </div>
                        </details>
                    </>
                ) : (
                    <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/20 text-center">
                        <p className="text-lg font-bold text-zinc-400">시스템이 아직 활성화되지 않았습니다</p>
                        <p className="text-sm text-zinc-500 mt-2">{bundle.configHint || "환경 설정을 확인해 주세요."}</p>
                    </div>
                )}
            </main>
        </div>
    );
}
