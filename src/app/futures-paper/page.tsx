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

function formatSignedUsdDisplay(v: number | null, empty = "N/A"): string {
  if (v === null || !Number.isFinite(v)) return empty;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  const body = formatCurrencyUsd(Math.abs(v), empty);
  if (body === empty) return empty;
  return sign + body;
}

function formatPctOnMargin(pnlUsd: number | null, marginUsd: number | null): string {
  if (pnlUsd === null || !Number.isFinite(pnlUsd)) return "N/A";
  if (marginUsd === null || !Number.isFinite(marginUsd) || marginUsd <= 0) return "N/A";
  const pct = (pnlUsd / marginUsd) * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return sign + Math.abs(pct).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) + "%";
}

function formatHoldShort(openedAtMs: number | null): string {
  if (openedAtMs === null || !Number.isFinite(openedAtMs)) return "N/A";
  const ms = Date.now() - openedAtMs;
  if (ms < 0) return "N/A";
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

/** Components */

function HeroMetric({
  label,
  value,
  valueClass
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 ring-1 ring-zinc-800/50 shadow-lg">
      <p className={`text-3xl font-black tabular-nums tracking-tighter sm:text-4xl ${valueClass ?? "text-zinc-100"}`}>
        {value}
      </p>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
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

function getRepresentativeStatus(row: any, dec: any, hasPosition: boolean) {
  if (hasPosition) {
    return {
      label: "포지션 보유 중",
      reason: "수익 최적화 및 실시간 모니터링 중"
    };
  }

  const s1Code = String(dec?.stage1_result_code || "");
  if (s1Code === "STAGE1_EXEC_PENDING" || s1Code === "STAGE1_ENTERED") {
    return {
      label: "진입 검토 중",
      reason: "유효한 변동성 감지, 조건 최종 확인 중"
    };
  }

  const failReason = String(dec?.final_fail_reason || "");
  const suppl = Array.isArray(dec?.supplemental_reasons) ? dec.supplemental_reasons : [];

  if (failReason.includes("COOLDOWN") || suppl.includes("RE-ENTRY_WAIT") || failReason.includes("LIMIT_REENTRY")) {
    return {
      label: "재진입 대기 중",
      reason: "재진입 제한 시간 적용 중"
    };
  }

  if (s1Code === "STAGE1_BLOCKED_RISK" || s1Code === "STAGE1_BLOCKED_LIMIT") {
    return {
      label: "리스크 제한 중",
      reason: "리스크 한도 도달로 신규 진입 보류"
    };
  }

  if (s1Code === "STAGE1_BLOCKED_QUALITY" || s1Code === "STAGE1_BLOCKED_EDGE") {
    return {
      label: "대기 중",
      reason: "비용 대비 기대 변동 부족 또는 품질 미달"
    };
  }

  return {
    label: "대기 중",
    reason: "관망 구간으로 판단되어 대기 중"
  };
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
  const side = pos.side === "short" ? "SHORT" : "LONG";

  const stopDisplay =
    n?.stopPx !== null && n?.stopPx !== undefined && Number.isFinite(n.stopPx!)
      ? formatPrice(n.stopPx, "N/A")
      : "미설정";

  const entryDisp = n?.entryPrice !== null && n?.entryPrice !== undefined ? formatPrice(n.entryPrice, "N/A") : "N/A";
  const markDisp = mark !== null ? formatPrice(mark, "N/A") : "N/A";

  const pe = coerceFinite(pos.partialExitStage);
  const exitProg =
    typeof pe === "number" && Number.isFinite(pe) ? `${Math.max(0, Math.min(3, Math.floor(pe)))}/3` : "N/A";

  const marginStr = margin !== null ? formatCurrencyUsd(margin, "N/A") : "N/A";
  const equityStr = equityUsd !== null ? formatCurrencyUsd(equityUsd, "N/A") : "N/A";

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

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCell label="진입금액 (Margin)" value={marginStr} />
        <MetricCell label="평가금액 (Equity)" value={equityStr} />
        <MetricCell label="미실현 손익" value={formatSignedUsdDisplay(uPnL)} valueClass={uClass} />
        <MetricCell label="수익률 %" value={uPct} valueClass={uClass} />
        <MetricCell label="보유시간" value={hold} className="col-span-2 sm:col-span-1" />
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
          <p className="mt-1 font-mono tabular-nums text-zinc-400 text-[11px] leading-tight">{formatDateTimeKst(coerceFinite(pos.openedAt), "N/A")}</p>
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
  const dec = (symbolDecisions as Record<string, { decision?: Record<string, unknown> }> | null)?.[sym]?.decision;
  const rep = getRepresentativeStatus(row, dec, hasPosition);

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
              <p className="mt-0.5 text-[10px] text-zinc-500">{formatDateTimeKst(row.fetchedAt, "N/A")}</p>
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
        <MetricCell label="최근 24시간 손익" value={pnl24h !== null ? formatSignedUsdDisplay(pnl24h) : "N/A"} valueClass={pnl24h === null ? "" : pnl24h >= 0 ? "text-emerald-400" : "text-rose-400"} />
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
                <th className="px-5 py-3">손익 (USD)</th>
                <th className="px-5 py-3">종료 사유</th>
                <th className="px-5 py-3 text-right">종료 시각</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {last5.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-zinc-500 italic">
                    최근 종료 거래 없음
                  </td>
                </tr>
              ) : (
                last5.map((t, i) => (
                  <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-bold text-zinc-100">{t.symbol}</td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${t.side === "short" ? "bg-rose-950/30 text-rose-400 ring-1 ring-rose-500/30" : "bg-emerald-950/30 text-emerald-400 ring-1 ring-emerald-500/30"}`}>
                        {t.side}
                      </span>
                    </td>
                    <td className={`px-5 py-3.5 font-mono font-bold ${t.pnlUsdNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {formatSignedUsdDisplay(t.pnlUsdNet)}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-400">{mapReasonLabel(t.exitType || t.exitReason || "N/A")}</td>
                    <td className="px-5 py-3.5 text-right text-[10px] text-zinc-500">{formatDateTimeKst(t.closedAt, "N/A")}</td>
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
  const side = trade.side === "short" ? "SHORT" : "LONG";
  const pnlClass = (trade.pnlUsdNet ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400";
  const holdMin = trade.closedAt && trade.openedAt ? Math.floor((trade.closedAt - trade.openedAt) / 60000) : null;

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">직전 종료 요약</h2>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 ring-1 ring-zinc-800/50 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="font-mono text-lg font-black text-zinc-100">{trade.symbol}</div>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${trade.side === "short" ? "bg-rose-950/30 text-rose-400 ring-rose-500/30" : "bg-emerald-950/30 text-emerald-400 ring-emerald-500/30"}`}>
              {side}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">종료 사유</p>
              <p className="mt-1 text-sm font-bold text-zinc-200">{mapReasonLabel(trade.exitType || trade.exitReason || "N/A")}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">실현 손익</p>
              <p className={`mt-1 font-mono text-sm font-black ${pnlClass}`}>{formatSignedUsdDisplay(trade.pnlUsdNet)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">종료 시각</p>
              <p className="mt-1 font-mono text-xs text-zinc-400">{formatDateTimeKst(trade.closedAt, "N/A")}</p>
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

/** Main Page */

export default function FuturesPaperPage() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showInternalTags, setShowInternalTags] = useState(false);

  const refreshData = async (isInitial = false) => {
    if (!isInitial) setIsRefreshing(true);
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
      if (isInitial) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshData(true);
    const interval = setInterval(() => {
      refreshData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const perf = bundle?.ledgerPerformance ?? null;
  const w7 = perf?.last7d ?? null;
  const history = Array.isArray(bundle?.positionsHistory) ? bundle.positionsHistory : [];
  const lastClosed = history.length > 0 ? history[history.length - 1] : null;

  const engine = bundle?.engineState ?? null;
  const curRegime = pick(engine, ["current_regime", "currentRegime", "regime"]);
  const riskState = pick(engine, ["risk_state", "riskStatus", "risk_state_status"]);
  const executor = pick(engine, ["active_mode_executor", "activeModeExecutor", "executor"]);

  const openPositions = Array.isArray(bundle?.openPositions) ? (bundle.openPositions as any[]) : [];
  const symbolDecisions = (engine as any)?.symbol_decisions ?? null;

  const pm = bundle ? aggregatePortfolioMetricsFromBundle(bundle) : { openCount: 0, totalUnreal: 0 };
  const realized7Num = w7?.totalPnlUsdNet ?? null;
  const win7Num = w7?.winRate ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">선물 페이퍼 모니터</h1>
              <p className="text-xs text-zinc-500">Bybit USDT · 모의 · 읽기 전용</p>
            </div>
            {lastUpdated && (
              <div className="hidden border-l border-zinc-700 pl-4 sm:block">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">마지막 갱신</p>
                <p className="text-[10px] text-zinc-400">
                  {lastUpdated.toLocaleTimeString("ko-KR")}
                  {isRefreshing && <span className="ml-2 animate-pulse text-amber-400">갱신 중...</span>}
                </p>
              </div>
            )}
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
        {loading && <p className="text-sm text-zinc-400">데이터 동기화 중…</p>}
        {err && (
          <div className="flex items-center justify-between rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            <span>{err}</span>
            <button onClick={() => refreshData(true)} className="rounded bg-red-900/40 px-3 py-1 text-[10px] font-bold hover:bg-red-800/60 transition-colors">재시도</button>
          </div>
        )}

        {bundle?.configured && (
          <>
            {/* ROW 1: Hero Metrics */}
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <HeroMetric label="현재 보유 포지션 수" value={formatCount(pm.openCount) + "건"} />
              <HeroMetric
                label="현재 미실현 손익 (USD)"
                value={formatSignedUsdDisplay(pm.totalUnreal)}
                valueClass={pm.totalUnreal >= 0 ? "text-emerald-400" : "text-rose-400"}
              />
              <HeroMetric
                label="최근 7일 실현 손익 (USD)"
                value={formatSignedUsdDisplay(realized7Num)}
                valueClass={(realized7Num ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}
              />
              <HeroMetric label="최근 7일 승률 (%)" value={formatPercent(win7Num)} />
            </section>

            {/* ROW 2: Current Positions */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">현재 포지션</h2>
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

            {/* ROW 3: Last Closed Summary */}
            <LastClosedSummaryCard trade={lastClosed} />

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

            {/* ROW 5: Recent Performance & History */}
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
                  <MetricCell label="현재 레짐 (Regime)" value={String(curRegime || "N/A")} valueClass="text-amber-200" />
                  <MetricCell label="실행기 (Executor)" value={String(executor || "N/A")} />
                  <MetricCell label="위험 상태 (Risk)" value={String(riskState || "N/A")} />
                  <MetricCell label="엔진 상태 (Status)" value={String(bundle?.engineState?.engine_status || "N/A")} />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                    <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">AI 승인 및 차단 현황</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">AI 승인율</span>
                      <span className="text-zinc-100 font-mono">84.2% (임시)</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                    <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">종료 타입(EXIT) 분포</p>
                    <p className="font-mono text-xs text-zinc-400">TP 60% · SL 5% · REGIME 10% · TREND 25% (임시)</p>
                  </div>
                </div>
              </div>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
