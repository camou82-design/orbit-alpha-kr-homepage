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
  mapStatusLabel
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
  summaryWindow: Record<string, unknown> | null;
  summaryHealth: Record<string, unknown> | null;
  dashboard: Record<string, unknown> | null;
  symbolRows: Array<Record<string, unknown>>;
  healthHistoryRecent: Array<Record<string, unknown>>;
  ledgerPerformance: LedgerPerformance | null;
};

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

  const statusCountsObj =
    trend?.statusCounts && typeof trend.statusCounts === "object" && trend.statusCounts !== null
      ? (trend.statusCounts as Record<string, unknown>)
      : null;

  const latestStatusesArr = Array.isArray(trend?.latestStatuses) ? (trend.latestStatuses as string[]) : [];

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

        {/* 상단: 상태 / 시각 / 손익 */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">요약 상태</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="운영 상태" value={mapStatusLabel(statusRaw)} emphasize />
            <div className="sm:col-span-2 lg:col-span-1">
              <p className="text-xs text-zinc-500">점검 사유</p>
              <div className="mt-1">
                <ReasonBadges reasons={reasonsArr} />
              </div>
            </div>
            <Stat label="헬스 리포트 시각 (KST)" value={formatDateTimeKst(generatedMs)} />
            <Stat
              label="성과 원장 집계 시각 (KST)"
              value={formatDateTimeKst(perfBaselineMs)}
              valueClass="text-xs text-zinc-400"
            />
            <Stat label="최근 7일 손익 (USD)" value={formatCurrencyUsd(w7?.totalPnlUsdNet)} valueClass="tabular-nums text-amber-100" />
            <Stat label="최근 30일 승률" value={formatPercent(w30?.winRate)} valueClass="tabular-nums" />
            <Stat label="전체 누적 손익 (USD)" value={formatCurrencyUsd(all?.totalPnlUsdNet)} valueClass="tabular-nums text-amber-100" />
          </div>
        </section>

        {/* 심볼 */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">심볼</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(bundle?.symbolRows?.length ?? 0) === 0 ? (
              <p className="text-sm text-zinc-500">데이터 없음</p>
            ) : (
              bundle!.symbolRows!.map((row) => (
                <div key={String(row.symbol)} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="font-mono text-base font-semibold tracking-tight text-amber-200/90">
                    {String(row.symbol)}
                  </div>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                    <dt className="text-zinc-500">시그널</dt>
                    <dd className="text-zinc-100">{mapSignalLabel(row.signal)}</dd>
                    <dt className="text-zinc-500">맥락</dt>
                    <dd className="text-zinc-100">{describeSnapshotContext(row)}</dd>
                    <dt className="text-zinc-500">최근 가격</dt>
                    <dd className="tabular-nums text-zinc-100">{formatPrice(row.lastPrice)}</dd>
                    <dt className="text-zinc-500">펀딩 비율</dt>
                    <dd className="font-mono text-xs tabular-nums text-zinc-300">{formatRateRaw(row.fundingRate)}</dd>
                    <dt className="text-zinc-500">데이터 시각 (KST)</dt>
                    <dd className="break-all text-xs text-zinc-300">{formatDateTimeKst(row.fetchedAt)}</dd>
                  </dl>
                </div>
              ))
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
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs font-medium text-zinc-500">{title}</p>
      <p className="mt-2 text-sm text-zinc-300">
        거래 수 <span className="ml-1 tabular-nums text-zinc-100">{formatCount(trades)}</span>
      </p>
      <p className="text-sm text-zinc-300">
        승률 <span className="ml-1 tabular-nums text-zinc-100">{formatPercent(wr)}</span>
      </p>
      <p className="mt-1 text-sm text-zinc-300">
        순손익 (net){" "}
        <span className="ml-1 tabular-nums font-medium text-amber-100/95">{formatCurrencyUsd(pnl)}</span>
      </p>
      {ledger ? (
        <dl className="mt-3 space-y-1 border-t border-zinc-800/80 pt-2 text-xs text-zinc-500">
          <div className="flex justify-between gap-2">
            <dt>gross</dt>
            <dd className="font-mono tabular-nums text-zinc-400">{formatCurrencyUsd(ledger.totalPnlUsdGross)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>fee</dt>
            <dd className="font-mono tabular-nums text-zinc-400">{formatCurrencyUsd(ledger.totalFeeUsd)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>funding</dt>
            <dd className="font-mono tabular-nums text-zinc-400">{formatCurrencyUsd(ledger.totalFundingUsd)}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
