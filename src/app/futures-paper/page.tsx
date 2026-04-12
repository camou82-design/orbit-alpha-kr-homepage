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
  interpretSymbolJudgment
} from "@/lib/futuresPaperFormat";

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
};

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

function pickNum(obj: unknown, keys: string[]): number | null {
  const v = pick(obj, keys);
  return num(v);
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
) {
  const lp = row && coerceFinite(row.lastPrice);
  if (lp !== null) return lp;
  const dm = dec && coerceFinite(dec.mark);
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

function ReasonBadges({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return <span className="text-sm text-zinc-500">데이터 없음</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reasons.map((r) => (
        <li
          key={r}
          className="rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-xs text-zinc-200"
          title={r}
        >
          {mapReasonLabel(r)}
        </li>
      ))}
    </ul>
  );
}

function StatusCountList({ counts }: { counts: Record<string, unknown> }) {
  const entries = Object.entries(counts).filter(([, v]) => typeof v === "number" && Number.isFinite(v));
  if (entries.length === 0) return <p className="text-sm text-zinc-500">데이터 없음</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {entries.map(([k, v]) => (
        <li key={k} className="flex justify-between gap-4 border-b border-zinc-800/60 py-1 last:border-0">
          <span className="text-zinc-400">{mapStatusLabel(k)}</span>
          <span className="font-mono text-zinc-100 tabular-nums">{formatCount(v, "-")}</span>
        </li>
      ))}
    </ul>
  );
}

function LatestStatusChain({ statuses }: { statuses: string[] }) {
  if (statuses.length === 0) return <span className="text-sm text-zinc-500">데이터 없음</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {statuses.map((s, i) => (
        <span key={`${s}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-zinc-600">→</span>}
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-amber-200/95" title={s}>
            {mapStatusLabel(s)}
          </span>
        </span>
      ))}
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


const STAGE1_RESULT_LABELS: Record<string, string> = {
  STAGE1_ENTERED: "진입 완료",
  STAGE1_EXEC_PENDING: "실행 검토 중",
  STAGE1_BLOCKED_LIMIT: "최대 포지션 제한",
  STAGE1_BLOCKED_EDGE: "수익성(EDGE) 미달",
  STAGE1_BLOCKED_RISK: "리스크 한도 초과",
  STAGE1_BLOCKED_QUALITY: "진입 품질 미달",
  STAGE1_BLOCKED_REGIME: "레짐 비허용",
  STAGE1_BLOCKED_DATA: "데이터 준비 미흡",
};

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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 ring-1 ring-zinc-800/50">
      <p className={`text-2xl font-extrabold tabular-nums tracking-tight sm:text-3xl ${valueClass ?? "text-zinc-100"}`}>
        {value}
      </p>
      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}

function PositionMoneyCard({
  pos,
  row,
  symbolDecisions
}: {
  pos: Record<string, unknown>;
  row: Record<string, unknown> | undefined;
  symbolDecisions: Record<string, unknown> | null;
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
      : "손절 미설정";

  const realizedStr =
    n && Number.isFinite(n.realized)
      ? formatSignedUsdDisplay(n.realized)
      : "N/A";

  const entryDisp = n?.entryPrice !== null && n?.entryPrice !== undefined ? formatPrice(n.entryPrice, "N/A") : "N/A";
  const markDisp = mark !== null ? formatPrice(mark, "N/A") : "N/A";

  const pe = coerceFinite(pos.partialExitStage);
  const exitProg =
    typeof pe === "number" && Number.isFinite(pe) ? `${Math.max(0, Math.min(3, Math.floor(pe)))}/3` : "N/A";

  const marginStr = margin !== null ? formatCurrencyUsd(margin, "N/A") : "N/A";
  const equityStr = equityUsd !== null ? formatCurrencyUsd(equityUsd, "N/A") : "N/A";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="font-mono text-lg font-bold text-amber-200">
          {sym}{" "}
          <span className={pos.side === "short" ? "text-rose-400" : "text-emerald-400"}>{side}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCell label="진입금액(USD)" value={marginStr} />
        <MetricCell label="현재 평가금액(USD)" value={equityStr} />
        <MetricCell label="미실현 손익(USD)" value={formatSignedUsdDisplay(uPnL)} valueClass={uClass} />
        <MetricCell label="수익률(%)" value={uPct} valueClass={uClass} />
        <MetricCell label="보유시간" value={hold} className="col-span-2 sm:col-span-1" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-zinc-800 pt-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">평균 진입가</p>
          <p className="mt-0.5 font-mono tabular-nums text-zinc-100">{entryDisp}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Mark</p>
          <p className="mt-0.5 font-mono tabular-nums text-amber-200/90">{markDisp}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">실현 손익</p>
          <p className="mt-0.5 font-mono tabular-nums text-zinc-200">{realizedStr}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">익절 진행</p>
          <p className="mt-0.5 font-mono tabular-nums text-zinc-200">{exitProg}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">손절가</p>
          <p className="mt-0.5 font-mono tabular-nums text-rose-300/90">{stopDisplay}</p>
        </div>
      </div>

      <details className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/40">
        <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:bg-zinc-800/50">
          진행 상세 · 가이드
        </summary>
        <div className="space-y-4 border-t border-zinc-800 p-4">
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
          {dec?.next_action && (
            <div className="rounded-md bg-amber-950/20 px-3 py-2.5 ring-1 ring-amber-900/40">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500/80">다음 예상 행동</p>
              <p className="mt-0.5 text-sm font-bold text-amber-200">{String(dec.next_action)}</p>
            </div>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-zinc-500">최초 진입</dt>
            <dd className="text-xs text-zinc-400">{formatDateTimeKst(coerceFinite(pos.openedAt), "N/A")}</dd>
            {pos.targetPrices && Array.isArray(pos.targetPrices) && (pos.targetPrices as unknown[]).length > 0 && (
              <>
                <dt className="text-zinc-500">목표가 (Targets)</dt>
                <dd className="space-x-2 tabular-nums font-mono text-xs text-emerald-400">
                  {(pos.targetPrices as number[]).map((t: number, i: number) => (
                    <span
                      key={i}
                      className={i < (coerceFinite(pos.partialExitStage) ?? 0) ? "line-through opacity-40" : ""}
                    >
                      {formatPrice(t, "N/A")}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </div>
      </details>
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
    <div className={className}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-sm font-bold tabular-nums sm:text-base ${valueClass ?? "text-zinc-100"}`}>
        {value}
      </p>
    </div>
  );
}

function SymbolJudgmentCard({
  row,
  symbolDecisions
}: {
  row: Record<string, unknown>;
  symbolDecisions: Record<string, unknown> | null;
}) {
  const judgment = interpretSymbolJudgment(row);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-center justify-between">
        <div className="font-mono text-lg font-bold text-amber-200">{String(row.symbol)}</div>
        <div
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${row.signal === "none" ? "bg-zinc-800 text-zinc-500 ring-zinc-700" : "bg-emerald-950/30 text-emerald-400 ring-emerald-500/50"}`}
        >
          {mapSignalLabel(row.signal)}
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">현재 판단</p>
          <p className="text-sm font-bold text-zinc-100">{judgment.label}</p>
          <p className="text-xs text-zinc-400">{judgment.sub}</p>
          {(() => {
            const dec = (symbolDecisions as Record<string, { decision?: Record<string, unknown> }> | null)?.[
              String(row.symbol)
            ]?.decision;
            const s1Code = dec?.stage1_result_code;
            const s1Label = (s1Code && STAGE1_RESULT_LABELS[String(s1Code)]) || String(s1Code ?? "");
            const failReason = dec?.final_fail_reason;
            const reqMove = dec?.required_move_pct;
            const shortfall = dec?.shortfall_pct;

            return (
              <div className="mt-2 space-y-2">
                {s1Code && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase text-zinc-500">Stage 1:</span>
                      <span
                        className={`text-[10px] font-bold ${s1Code === "STAGE1_ENTERED" ? "text-emerald-400" : "text-amber-400"}`}
                      >
                        {s1Label}
                      </span>
                    </div>
                    {reqMove != null && (
                      <div className="flex items-center gap-1 text-[9px]">
                        <span className="text-zinc-500">요구폭:</span>
                        <span className="font-mono text-zinc-300">{formatPercent(reqMove, "N/A")}</span>
                      </div>
                    )}
                    {typeof shortfall === "number" && shortfall > 0 && (
                      <div className="flex items-center gap-1 text-[9px]">
                        <span className="text-rose-500/80">부족:</span>
                        <span className="font-mono text-rose-400">-{formatPercent(shortfall, "N/A")}</span>
                      </div>
                    )}
                  </div>
                )}
                {failReason && (
                  <p className="rounded bg-rose-950/20 p-1 text-[9px] leading-tight text-rose-400/80">
                    실패 사유: {String(failReason)}
                  </p>
                )}
                {(() => {
                  const suppl = Array.isArray(dec?.supplemental_reasons) ? dec!.supplemental_reasons : [];
                  if (!Array.isArray(suppl) || suppl.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1">
                      {suppl.map((r: string) => (
                        <span key={r} className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9px] text-zinc-500 ring-1 ring-zinc-800">
                          {mapReasonLabel(r)}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-zinc-800 pt-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">방향 감지</p>
            <p className="mt-0.5 text-xs font-medium text-zinc-200">{describeSnapshotContext(row)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">진입 가능성</p>
            <p className="mt-0.5 text-xs font-bold text-amber-400">{judgment.probability}</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-zinc-950/40 p-3">
          <div>
            <p className="text-[10px] font-medium text-zinc-500">현재 가격</p>
            <p className="font-mono text-sm font-bold text-zinc-300">{formatPrice(row.lastPrice, "N/A")}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium text-zinc-500">마지막 업데이트</p>
            <p className="text-[10px] text-zinc-500">{formatDateTimeKst(row.fetchedAt, "N/A")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FuturesPaperPage() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/futures-paper/data", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as Bundle;
        if (!cancelled) setBundle(j);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dash = bundle?.dashboard ?? null;
  const snap = (dash?.snapshot as Record<string, unknown> | undefined) ?? null;
  const perf = bundle?.ledgerPerformance ?? null;
  /** 성과 숫자: 원장 재집계 우선, 구 API는 dashboard.snapshot 폴백 */
  const all = perf?.all ?? (snap?.all as Record<string, unknown> | undefined) ?? null;
  const w7 = perf?.last7d ?? (snap?.last7d as Record<string, unknown> | undefined) ?? null;
  const w30 = perf?.last30d ?? (snap?.last30d as Record<string, unknown> | undefined) ?? null;
  const mtd = perf?.monthToDate ?? (snap?.monthToDate as Record<string, unknown> | undefined) ?? null;
  const trend = (dash?.recentTrend as Record<string, unknown> | undefined) ?? null;

  const generatedMs = dash?.generatedAt ?? bundle?.summaryHealth?.generatedAt;

  const engine = bundle?.engineState ?? null;
  const curRegime = pick(engine, ["current_regime", "currentRegime", "regime"]);
  const engineStatus = pick(engine, ["engine_status", "engineStatus"]);
  const riskState = pick(engine, ["risk_state", "riskStatus", "risk_state_status"]);
  const executor = pick(engine, ["active_mode_executor", "activeModeExecutor", "executor"]);
  const isAmbiguous = !!(engine as any)?.is_ambiguous;

  const obs = (bundle?.summary?.observation as Record<string, unknown> | undefined) ?? null;
  const aiApproval = (obs?.aiApproval as Record<string, unknown> | undefined) ?? null;
  const aiBlockQuality = (obs?.aiBlockQuality as Record<string, unknown> | undefined) ?? null;
  const aiApprovalRate = pickNum(aiApproval, ["ai_approval_rate", "aiApprovalRate"]);
  const aiQualityRate = pickNum(aiBlockQuality, ["ai_block_quality_rate", "aiBlockQualityRate"]);

  // 일부 번들에서는 summaryRange/summaryTrend가 null일 수 있어 summary.observation.range/trend로 폴백한다.
  const rangeNet =
    pickNum(bundle?.summaryRange, ["totalPnlUsdNet", "total_pnl_usd_net"]) ??
    pickNum((obs as any)?.range, ["totalPnlUsdNet", "total_pnl_usd_net"]);
  const trendNet =
    pickNum(bundle?.summaryTrend, ["totalPnlUsdNet", "total_pnl_usd_net"]) ??
    pickNum((obs as any)?.trend, ["totalPnlUsdNet", "total_pnl_usd_net"]);

  const blockedCounts = pick(aiApproval, ["blocked_reason_counts", "blockedReasonCounts"]);
  const blockedTop = topNCounts(blockedCounts, 5);

  const exitMix = (obs?.exitMix as Record<string, unknown> | undefined) ?? null;
  const exitLine = exitMix
    ? [
      `TP ${formatPercent(pickNum(exitMix, ["r_EXIT_TP", "rExitTp"]), "N/A")}`,
      `SL ${formatPercent(pickNum(exitMix, ["r_EXIT_SL", "rExitSl"]), "N/A")}`,
      `REGIME ${formatPercent(pickNum(exitMix, ["r_EXIT_REGIME", "rExitRegime"]), "N/A")}`,
      `TREND_BREAK ${formatPercent(pickNum(exitMix, ["r_EXIT_TREND_BREAK", "rExitTrendBreak"]), "N/A")}`
    ].join(" · ")
    : "N/A";

  const statusCountsObj =
    trend?.statusCounts && typeof trend.statusCounts === "object" && trend.statusCounts !== null
      ? (trend.statusCounts as Record<string, unknown>)
      : null;

  const latestStatusesArr = Array.isArray(trend?.latestStatuses) ? (trend.latestStatuses as string[]) : [];

  const openPositions = Array.isArray(bundle?.openPositions) ? (bundle.openPositions as any[]) : [];
  const symbolDecisions = (engine as any)?.symbol_decisions ?? null;

  const pm = bundle ? aggregatePortfolioMetricsFromBundle(bundle) : { openCount: 0, totalUnreal: 0 };
  const realized7Num = num(w7?.totalPnlUsdNet as unknown);
  const win7Num = num(w7?.winRate as unknown);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">선물 페이퍼 모니터</h1>
            <p className="text-xs text-zinc-500">Bybit USDT · 모의 · 읽기 전용</p>
          </div>
          <Link href="/" className="text-sm text-amber-400/90 hover:text-amber-300">
            ← orbitalpha.kr
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {loading && <p className="text-sm text-zinc-400">불러오는 중…</p>}
        {err && (
          <div className="rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        )}

        {!bundle?.configured && !loading && (
          <div className="rounded border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            <p className="font-medium">데이터 경로 미설정</p>
            <p className="mt-1 text-amber-200/80">{bundle?.configHint ?? "서버 환경 변수를 확인하세요."}</p>
          </div>
        )}

        {bundle?.configured && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HeroMetric label="총 보유 포지션 수" value={String(pm.openCount)} />
            <HeroMetric
              label="총 미실현 손익(USD)"
              value={formatSignedUsdDisplay(pm.totalUnreal)}
              valueClass={pm.totalUnreal >= 0 ? "text-emerald-400" : "text-rose-400"}
            />
            <HeroMetric
              label="최근 7일 실현 손익(USD)"
              value={realized7Num !== null ? formatSignedUsdDisplay(realized7Num) : "N/A"}
              valueClass={
                realized7Num === null
                  ? "text-zinc-100"
                  : realized7Num >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
              }
            />
            <HeroMetric
              label="최근 7일 승률(%)"
              value={win7Num !== null ? formatPercent(win7Num, "N/A") : "N/A"}
            />
          </div>
        )}

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">종목별 포지션 · 손익</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {!bundle?.configured ? (
              <p className="text-sm text-zinc-500">데이터 경로가 설정되면 표시됩니다.</p>
            ) : pm.openCount > 0 ? (
              openPositions.map((o) => {
                const pos = o as Record<string, unknown>;
                const sym = String(pos.symbol ?? "");
                const row = bundle.symbolRows?.find((r) => String(r.symbol) === sym);
                return (
                  <PositionMoneyCard key={sym} pos={pos} row={row} symbolDecisions={symbolDecisions} />
                );
              })
            ) : (
              SYMBOL_ORDER.map((sym) => {
                const row = bundle.symbolRows?.find((r) => String(r.symbol) === sym);
                if (row) {
                  return <SymbolJudgmentCard key={sym} row={row} symbolDecisions={symbolDecisions} />;
                }
                return (
                  <div
                    key={sym}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-500"
                  >
                    스냅샷 없음 · {sym}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <details className="group rounded-lg border border-zinc-800 bg-zinc-900/30">
          <summary className="flex cursor-pointer items-center justify-between p-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:bg-zinc-800/50">
            <span>상세 분석 · 차단 · EXIT (운영자/개발자용)</span>
            <span className="transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="space-y-6 border-t border-zinc-800 p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="레짐(Regime)" value={`${String(curRegime ?? "-")}${isAmbiguous ? " (모호/인접)" : ""}`} />
              <Stat label="실행기(Executor)" value={String(executor ?? "-")} />
              <Stat label="위험도(Risk)" value={String(riskState ?? "-")} />
              <Stat label="엔진 상태" value={mapStatusLabel(engineStatus)} />
              <Stat label="AI 승인율" value={formatPercent(aiApprovalRate, "N/A")} />
              <Stat label="AI 차단 품질" value={formatPercent(aiQualityRate, "N/A")} />
              <Stat label="레인지 손익" value={formatCurrencyUsd(rangeNet, "N/A")} />
              <Stat label="트렌드 손익" value={formatCurrencyUsd(trendNet, "N/A")} />
              <Stat label="전체 누적" value={formatCurrencyUsd(all?.totalPnlUsdNet, "N/A")} />
              <Stat label="최신 갱신" value={formatDateTimeKst(generatedMs, "N/A")} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">차단 사유 상세</p>
                {blockedTop.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">대기 중</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {blockedTop.map((x) => (
                      <li key={x.key} className="flex justify-between border-b border-zinc-800/60 py-1 last:border-0">
                        <span className="text-zinc-400">{mapReasonLabel(String(x.key))}</span>
                        <span className="font-mono text-zinc-100">{formatCount(x.value, "N/A")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">EXIT 타입 분포</p>
                <p className="mt-2 text-sm text-zinc-200 tabular-nums">{exitLine}</p>
              </div>
            </div>
          </div>
        </details>

        <details className="group rounded-lg border border-zinc-800 bg-zinc-900/30">
          <summary className="flex cursor-pointer items-center justify-between p-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:bg-zinc-800/50">
            <span>성과 요약 · 최근 상태 · 헬스 이력</span>
            <span className="transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="space-y-6 border-t border-zinc-800 p-5">
            <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">성과 요약</h2>
              <p className="mb-4 text-xs text-zinc-500">
                {perf
                  ? `종료 거래 원장(data/positions/history.json)에서 파싱 ${formatCount(perf.parsedTradeCount)}건 · 창 경계는 집계 시각(UTC) 기준`
                  : "구번들: dashboard.snapshot 기준(원장과 어긋날 수 있음). Lightsail reader API를 최신화하면 원장 집계로 통일됩니다."}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MiniBlock title="전체 누적" slice={all} />
                <MiniBlock title="최근 7일" slice={w7} />
                <MiniBlock title="최근 30일" slice={w30} />
                <MiniBlock title="이번 달" slice={mtd} />
              </div>
            </section>

            <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">최근 상태 흐름</h2>
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <p className="text-xs text-zinc-500">직전 스냅샷 대비</p>
                  <p className="mt-1 text-sm font-medium text-zinc-100">{formatChanged(trend?.changed)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">상태 카운트 (최근 10회 구간)</p>
                  <div className="mt-2">
                    {statusCountsObj ? (
                      <StatusCountList counts={statusCountsObj} />
                    ) : (
                      <p className="text-sm text-zinc-500">N/A</p>
                    )}
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <p className="text-xs text-zinc-500">최근 상태 (최신 → 과거)</p>
                  <div className="mt-2">
                    <LatestStatusChain statuses={latestStatusesArr} />
                  </div>
                </div>
                <div className="lg:col-span-2 grid gap-1 text-xs text-zinc-600 sm:grid-cols-2">
                  <span>기준 시각: {formatDateTimeKst(trend?.latestGeneratedAt, "N/A")}</span>
                  <span>이전 시각: {formatDateTimeKst(trend?.previousGeneratedAt, "N/A")}</span>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                헬스 이력 (최근 {bundle?.healthHistoryRecent?.length ?? 0}건)
              </h2>
              {(bundle?.healthHistoryRecent?.length ?? 0) === 0 ? (
                <p className="text-sm text-zinc-500">N/A</p>
              ) : (
                <ul className="divide-y divide-zinc-800/80">
                  {[...(bundle!.healthHistoryRecent!)]
                    .reverse()
                    .map((h, i) => (
                      <li
                        key={`${h.generatedAt}-${i}`}
                        className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:gap-3"
                      >
                        <span className="shrink-0 text-xs text-zinc-500">{formatDateTimeKst(h.generatedAt, "N/A")}</span>
                        <span
                          className="shrink-0 rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-amber-200"
                          title={String(h.status ?? "")}
                        >
                          {mapStatusLabel(h.status)}
                        </span>
                        <div className="min-w-0 flex-1">
                          {Array.isArray(h.reasons) && (h.reasons as string[]).length > 0 ? (
                            <ReasonBadges reasons={h.reasons as string[]} />
                          ) : (
                            <span className="text-sm text-zinc-500">-</span>
                          )}
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </div>
        </details>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  emphasize,
  valueClass
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`mt-1 break-words text-sm text-zinc-100 ${emphasize ? "text-base font-semibold" : ""} ${valueClass ?? ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function isLedgerSlice(v: unknown): v is LedgerWindow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.totalTrades === "number" &&
    typeof o.winRate === "number" &&
    typeof o.totalPnlUsdNet === "number" &&
    typeof o.totalPnlUsdGross === "number" &&
    typeof o.totalFeeUsd === "number" &&
    typeof o.totalFundingUsd === "number"
  );
}

function MiniBlock({ title, slice }: { title: string; slice: unknown }) {
  const ledger = isLedgerSlice(slice) ? slice : null;
  const trades = ledger?.totalTrades ?? (slice as Record<string, unknown> | null)?.totalTrades;
  const wr = ledger?.winRate ?? (slice as Record<string, unknown> | null)?.winRate;
  const pnl = ledger?.totalPnlUsdNet ?? (slice as Record<string, unknown> | null)?.totalPnlUsdNet;
  const interpretation = interpretPerformance(slice);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 hover:bg-zinc-900/60 transition-colors">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{title}</p>

      <div className="mt-3 space-y-1">
        <p className={`text-sm font-bold ${interpretation.label === "호조" ? "text-emerald-400" : interpretation.label === "부진" ? "text-rose-400" : "text-zinc-300"}`}>
          {interpretation.label}
        </p>
        <p className="text-[10px] text-zinc-500 leading-tight">{interpretation.sub}</p>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[10px] text-zinc-500">순손익 (Net)</p>
          <p className="font-mono text-base font-bold text-amber-100">{formatCurrencyUsd(pnl)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-zinc-500">승률</p>
          <p className="font-mono text-sm font-semibold text-zinc-300">{formatPercent(wr)}</p>
        </div>
      </div>

      {ledger && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[10px] text-zinc-600 hover:text-zinc-400">상세 수수료/비용 보기</summary>
          <dl className="mt-2 space-y-1 text-[10px] text-zinc-500 border-t border-zinc-800/50 pt-2">
            <div className="flex justify-between">
              <dt>총 거래</dt>
              <dd className="font-mono tabular-nums">{formatCount(trades)}건</dd>
            </div>
            <div className="flex justify-between">
              <dt>수수료 합계</dt>
              <dd className="font-mono tabular-nums text-rose-400/80">{formatCurrencyUsd(ledger.totalFeeUsd)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>펀딩 합계</dt>
              <dd className="font-mono tabular-nums text-zinc-400">{formatCurrencyUsd(ledger.totalFundingUsd)}</dd>
            </div>
          </dl>
        </details>
      )}
    </div>
  );
}
