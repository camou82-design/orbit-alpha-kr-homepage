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
  formatRateRaw,
  describeSnapshotContext,
  mapReasonLabel,
  mapSignalLabel,
  mapStatusLabel,
  formatEntryStage,
  formatExitStage,
  interpretCurrentStatus,
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

function CoreCard({ title, label, sub, color }: { title: string; label: string; sub: string; color: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 ring-1 ring-zinc-800/50">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{title}</p>
      <p className={`mt-2 text-lg font-bold ${color}`}>{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{sub}</p>
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
  const perfBaselineMs = perf?.generatedAt ?? null;

  const statusRaw = dash?.status ?? bundle?.summaryHealth?.status;
  const reasonsArr = Array.isArray(dash?.reasons) ? (dash.reasons as string[]) : [];
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
      `TP ${formatPercent(pickNum(exitMix, ["r_EXIT_TP", "rExitTp"]))}`,
      `SL ${formatPercent(pickNum(exitMix, ["r_EXIT_SL", "rExitSl"]))}`,
      `REGIME ${formatPercent(pickNum(exitMix, ["r_EXIT_REGIME", "rExitRegime"]))}`,
      `TREND_BREAK ${formatPercent(pickNum(exitMix, ["r_EXIT_TREND_BREAK", "rExitTrendBreak"]))}`
    ].join(" · ")
    : "데이터 없음";

  const statusCountsObj =
    trend?.statusCounts && typeof trend.statusCounts === "object" && trend.statusCounts !== null
      ? (trend.statusCounts as Record<string, unknown>)
      : null;

  const latestStatusesArr = Array.isArray(trend?.latestStatuses) ? (trend.latestStatuses as string[]) : [];

  const openPositions = Array.isArray(bundle?.openPositions) ? (bundle.openPositions as any[]) : [];
  const symbolDecisions = (engine as any)?.symbol_decisions ?? null;

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

        {/* 한 줄 요약 바 */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-2xl shadow-amber-900/10 ring-1 ring-amber-500/20">
          <p className="text-sm font-bold text-amber-100 sm:text-lg">
            {(() => {
              const status = interpretCurrentStatus(bundle).label;
              if (status === "포지션 보유 중") return "🚀 현재 시장 기회를 포착하여 포지션을 보유 중입니다.";
              if (status === "진입 대기 중") return "🔍 엔진이 정상 가동 중이며, 최적의 진입 조건을 탐색하고 있습니다.";
              if (status === "보수적 관망 중") return "🛡️ 리스크 관리를 위해 무리한 진입을 피하고 보수적으로 시장을 살피는 중입니다.";
              if (reasonsArr.includes("low_expected_move")) return "⚖️ 현재는 관망 구간입니다. 아직 수익 여지가 작아 진입하지 않고 있습니다.";
              return "🛡️ 엔진은 기회를 기다리는 중이며, 조건이 맞으면 자동으로 진입을 검토합니다.";
            })()}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-amber-200/60 sm:text-sm">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            <span>최근 성과 {interpretPerformance(w7).label}({formatCurrencyUsd(w7?.totalPnlUsdNet)})를 기록 중이며, 보수적 필터를 유지하고 있습니다.</span>
          </div>
        </div>

        {/* 핵심 4개 카드 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CoreCard
            title="현재 상태"
            label={interpretCurrentStatus(bundle).label}
            sub={interpretCurrentStatus(bundle).sub}
            color="text-emerald-400"
          />
          <CoreCard
            title="지금 안 들어가는 이유"
            label={reasonsArr.length > 0 ? mapReasonLabel(reasonsArr[0]) : (curRegime === "NO_TRADE" ? "좋은 진입 자리를 기다리는 중" : "진입 신호 대기 중")}
            sub="시장 데이터와 전략 로직을 실시간 비교 중입니다"
            color="text-amber-400"
          />
          <CoreCard
            title="최근 성과 상태"
            label={interpretPerformance(w7).label}
            sub={interpretPerformance(w7).sub}
            color={interpretPerformance(w7).label === "호조" ? "text-emerald-400" : "text-rose-400"}
          />
          <CoreCard
            title="엔진 동작 상태"
            label={mapStatusLabel(engineStatus)}
            sub={`최신 갱신: ${formatDateTimeKst(generatedMs)}`}
            color="text-blue-400"
          />
        </div>

        {/* 상세 분석 펼치기 (운영자 전용) */}
        <details className="group rounded-lg border border-zinc-800 bg-zinc-900/30">
          <summary className="flex cursor-pointer items-center justify-between p-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:bg-zinc-800/50">
            <span>상세 분석 펼치기 (운영자/개발자용)</span>
            <span className="transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="space-y-6 border-t border-zinc-800 p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="레짐(Regime)" value={`${String(curRegime ?? "-")}${isAmbiguous ? " (모호/인접)" : ""}`} />
              <Stat label="실행기(Executor)" value={String(executor ?? "-")} />
              <Stat label="위험도(Risk)" value={String(riskState ?? "-")} />
              <Stat label="AI 승인율" value={formatPercent(aiApprovalRate)} />
              <Stat label="AI 차단 품질" value={formatPercent(aiQualityRate)} />
              <Stat label="레인지 손익" value={formatCurrencyUsd(rangeNet)} />
              <Stat label="트렌드 손익" value={formatCurrencyUsd(trendNet)} />
              <Stat label="전체 누적" value={formatCurrencyUsd(all?.totalPnlUsdNet)} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">차단 사유 상세</p>
                {blockedTop.length === 0 ? <p className="mt-2 text-sm text-zinc-500">대기 중</p> : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {blockedTop.map((x) => (
                      <li key={x.key} className="flex justify-between border-b border-zinc-800/60 py-1 last:border-0">
                        <span className="text-zinc-400">{mapReasonLabel(String(x.key))}</span>
                        <span className="font-mono text-zinc-100">{formatCount(x.value)}</span>
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


        {/* 보유 포지션 */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">진입/추가진입 진행 현황</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {openPositions.length === 0 ? (
              <p className="text-sm text-zinc-500">보유한 포지션이 없습니다.</p>
            ) : (
              openPositions.map((pos, idx) => {
                const dec = symbolDecisions?.[pos.symbol]?.decision;
                const guidance = dec?.guidance;
                return (
                  <div key={`${pos.symbol}-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-base font-semibold tracking-tight text-amber-200/90">
                        {pos.symbol} <span className={pos.side === 'long' ? 'text-emerald-400' : 'text-rose-400'}>{pos.side.toUpperCase()}</span>
                      </div>
                      <div className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-amber-200">
                        {formatEntryStage(pos.entryStage ?? 1)}
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      {/* 단계 시각화 */}
                      <div className="grid grid-cols-2 gap-4">
                        <StageProgress
                          current={pos.entryStage ?? 1}
                          total={3}
                          colorClass="bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                          label="진입 단계"
                        />
                        <StageProgress
                          current={pos.partialExitStage ?? 0}
                          total={3}
                          colorClass="bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]"
                          label="익절 단계"
                        />
                      </div>

                      <div className="grid gap-2">
                        <div className="rounded-md bg-zinc-900 px-3 py-2.5 ring-1 ring-zinc-800">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">현재 가이드</p>
                          <p className="mt-0.5 text-sm font-medium text-zinc-200">{guidance || "관망 및 신호 대기"}</p>
                        </div>
                        {dec?.next_action && (
                          <div className="rounded-md bg-amber-950/20 px-3 py-2.5 ring-1 ring-amber-900/40">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500/80">다음 예상 행동</p>
                            <p className="mt-0.5 text-sm font-bold text-amber-200">{dec.next_action}</p>
                          </div>
                        )}
                        {dec?.invalidate_condition && (
                          <div className="rounded-md bg-red-950/10 px-3 py-2 ring-1 ring-red-900/20">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-red-500/60">무효화 조건</p>
                            <p className="mt-0.5 text-xs text-red-300/80">{dec.invalidate_condition}</p>
                          </div>
                        )}
                      </div>

                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                        <dt className="text-zinc-500">평균 매수단가</dt>
                        <dd className="tabular-nums text-zinc-100">{formatPrice(pos.entryPrice)}</dd>

                        <dt className="text-zinc-500">현재가 (Mark)</dt>
                        <dd className="tabular-nums text-amber-200/90 font-mono italic">{formatPrice(dec?.mark || bundle?.symbolRows?.find(r => r.symbol === pos.symbol)?.lastPrice)}</dd>

                        <dt className="text-zinc-500">현재 총 비중</dt>
                        <dd className="tabular-nums text-zinc-100 font-bold">{formatCurrencyUsd(pos.sizeUsd)}</dd>

                        <dt className="text-zinc-500">미실현 수익</dt>
                        <dd className="flex items-center gap-2">
                          <span className={`tabular-nums font-bold ${(pos.unrealizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatCurrencyUsd(pos.unrealizedPnl ?? 0)}
                          </span>
                          <span className={`text-[10px] font-mono px-1 rounded ${(pos.unrealizedPnlPct ?? 0) >= 0 ? 'bg-emerald-950/30 text-emerald-400' : 'bg-rose-950/30 text-rose-400'}`}>
                            {formatPercent(pos.unrealizedPnlPct ?? 0)}
                          </span>
                        </dd>

                        {pos.realizedPnl !== undefined && pos.realizedPnl !== 0 && (
                          <>
                            <dt className="text-zinc-500">누적 실현 수익</dt>
                            <dd className={`tabular-nums font-bold ${pos.realizedPnl > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {formatCurrencyUsd(pos.realizedPnl)}
                            </dd>
                          </>
                        )}

                        <div className="col-span-2 my-1 border-t border-zinc-900" />

                        <dt className="text-zinc-500">손절가 (Stop)</dt>
                        <dd className="tabular-nums text-rose-400 font-bold">{formatPrice(pos.stopPrice || dec?.stop_price)}</dd>

                        {pos.targetPrices && Array.isArray(pos.targetPrices) && pos.targetPrices.length > 0 && (
                          <>
                            <dt className="text-zinc-500">목표가 (Targets)</dt>
                            <dd className="space-x-2 tabular-nums text-emerald-400 text-xs font-mono">
                              {pos.targetPrices.map((t: number, i: number) => (
                                <span key={i} className={i < (pos.partialExitStage ?? 0) ? "line-through opacity-40" : ""}>
                                  {formatPrice(t)}
                                </span>
                              ))}
                            </dd>
                          </>
                        )}

                        <dt className="text-zinc-500">최초 진입</dt>
                        <dd className="text-xs text-zinc-400">{formatDateTimeKst(pos.openedAt)}</dd>
                      </dl>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* 종목별 판단 */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">종목별 실시간 판단</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(bundle?.symbolRows?.length ?? 0) === 0 ? (
              <p className="text-sm text-zinc-500">데이터를 불러올 수 없습니다.</p>
            ) : (
              bundle!.symbolRows!.map((row) => {
                const judgment = interpretSymbolJudgment(row);
                return (
                  <div key={String(row.symbol)} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-lg font-bold text-amber-200">{String(row.symbol)}</div>
                      <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${row.signal === "none" ? "bg-zinc-800 text-zinc-500 ring-zinc-700" : "bg-emerald-950/30 text-emerald-400 ring-emerald-500/50"}`}>
                        {mapSignalLabel(row.signal)}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">현재 판단</p>
                        <p className="text-sm font-bold text-zinc-100">{judgment.label}</p>
                        <p className="text-xs text-zinc-400">{judgment.sub}</p>
                        {(() => {
                          const dec = (symbolDecisions as any)?.[row.symbol]?.decision;
                          const suppl = Array.isArray(dec?.supplemental_reasons) ? dec.supplemental_reasons : [];
                          if (suppl.length === 0) return null;
                          return (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {suppl.map((r: string) => (
                                <span key={r} className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9px] text-zinc-500 ring-1 ring-zinc-800">
                                  {mapReasonLabel(r)}
                                </span>
                              ))}
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
                          <p className="font-mono text-sm font-bold text-zinc-300">{formatPrice(row.lastPrice)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-medium text-zinc-500">마지막 업데이트</p>
                          <p className="text-[10px] text-zinc-500">{formatDateTimeKst(row.fetchedAt)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* 성과 요약 */}
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

        {/* 최근 상태 (대시보드) */}
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
                {statusCountsObj ? <StatusCountList counts={statusCountsObj} /> : <p className="text-sm text-zinc-500">데이터 없음</p>}
              </div>
            </div>
            <div className="lg:col-span-2">
              <p className="text-xs text-zinc-500">최근 상태 (최신 → 과거)</p>
              <div className="mt-2">
                <LatestStatusChain statuses={latestStatusesArr} />
              </div>
            </div>
            <div className="lg:col-span-2 grid gap-1 text-xs text-zinc-600 sm:grid-cols-2">
              <span>
                기준 시각: {formatDateTimeKst(trend?.latestGeneratedAt)}
              </span>
              <span>
                이전 시각: {formatDateTimeKst(trend?.previousGeneratedAt)}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            헬스 이력 (최근 {bundle?.healthHistoryRecent?.length ?? 0}건)
          </h2>
          {(bundle?.healthHistoryRecent?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">데이터 없음</p>
          ) : (
            <ul className="divide-y divide-zinc-800/80">
              {[...(bundle!.healthHistoryRecent!)]
                .reverse()
                .map((h, i) => (
                  <li key={`${h.generatedAt}-${i}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:gap-3">
                    <span className="shrink-0 text-xs text-zinc-500">{formatDateTimeKst(h.generatedAt)}</span>
                    <span className="shrink-0 rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-amber-200" title={String(h.status ?? "")}>
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
