"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Bundle = {
  configured: boolean;
  configHint: string | null;
  summary: Record<string, unknown> | null;
  summaryWindow: Record<string, unknown> | null;
  summaryHealth: Record<string, unknown> | null;
  dashboard: Record<string, unknown> | null;
  symbolRows: Array<Record<string, unknown>>;
  healthHistoryRecent: Array<Record<string, unknown>>;
};

function fmtNum(n: unknown, digits = 4): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtTs(ms: unknown): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toISOString();
  } catch {
    return "—";
  }
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
  const all = (snap?.all as Record<string, unknown> | undefined) ?? null;
  const w7 = (snap?.last7d as Record<string, unknown> | undefined) ?? null;
  const w30 = (snap?.last30d as Record<string, unknown> | undefined) ?? null;
  const mtd = (snap?.monthToDate as Record<string, unknown> | undefined) ?? null;
  const trend = (dash?.recentTrend as Record<string, unknown> | undefined) ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Futures Paper</h1>
            <p className="text-xs text-zinc-500">Bybit USDT · simulation only · read-only</p>
          </div>
          <Link href="/" className="text-sm text-amber-400/90 hover:text-amber-300">
            ← orbitalpha.kr
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        {loading && <p className="text-sm text-zinc-400">불러오는 중…</p>}
        {err && (
          <div className="rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        )}

        {!bundle?.configured && !loading && (
          <div className="rounded border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            <p className="font-medium">데이터 경로 미설정</p>
            <p className="mt-1 text-amber-200/80">{bundle?.configHint ?? "ORBITALPHA_FUTURES_PAPER_ROOT 환경 변수를 설정하세요."}</p>
          </div>
        )}

        {/* 1. 상단 상태 */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">상태</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="status" value={String(dash?.status ?? bundle?.summaryHealth?.status ?? "—")} />
            <Stat
              label="reasons"
              value={
                Array.isArray(dash?.reasons)
                  ? (dash.reasons as string[]).join(", ") || "—"
                  : "—"
              }
            />
            <Stat label="generatedAt" value={fmtTs(dash?.generatedAt ?? bundle?.summaryHealth?.generatedAt)} />
            <Stat label="last7d total PnL (USD)" value={`$${fmtNum(w7?.totalPnlUsdNet, 6)}`} />
            <Stat label="last30d win rate" value={String(w30?.winRate ?? "—")} />
            <Stat label="all total PnL (USD)" value={`$${fmtNum(all?.totalPnlUsdNet, 6)}`} />
          </div>
        </section>

        {/* 2. 심볼 */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">심볼</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(bundle?.symbolRows?.length ?? 0) === 0 ? (
              <p className="text-sm text-zinc-500">데이터 없음 (snapshots/latest.json)</p>
            ) : (
              bundle!.symbolRows!.map((row) => (
                <div key={String(row.symbol)} className="rounded border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
                  <div className="font-mono font-semibold text-amber-200/90">{String(row.symbol)}</div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    <dt className="text-zinc-500">signal</dt>
                    <dd className="text-zinc-200">{String(row.signal ?? "—")}</dd>
                    <dt className="text-zinc-500">trendOk</dt>
                    <dd className="text-zinc-200">{String(row.trendOk ?? "—")}</dd>
                    <dt className="text-zinc-500">lastPrice</dt>
                    <dd className="text-zinc-200">{fmtNum(row.lastPrice, 2)}</dd>
                    <dt className="text-zinc-500">fundingRate</dt>
                    <dd className="text-zinc-200">{fmtNum(row.fundingRate, 6)}</dd>
                    <dt className="text-zinc-500">fetchedAt</dt>
                    <dd className="break-all text-zinc-300">{fmtTs(row.fetchedAt)}</dd>
                  </dl>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 3. 성과 요약 */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">성과 요약</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniBlock title="전체 누적" trades={all?.totalTrades} wr={all?.winRate} pnl={all?.totalPnlUsdNet} />
            <MiniBlock title="최근 7일" trades={w7?.totalTrades} wr={w7?.winRate} pnl={w7?.totalPnlUsdNet} />
            <MiniBlock title="최근 30일" trades={w30?.totalTrades} wr={w30?.winRate} pnl={w30?.totalPnlUsdNet} />
            <MiniBlock title="monthToDate" trades={mtd?.totalTrades} wr={mtd?.winRate} pnl={mtd?.totalPnlUsdNet} />
          </div>
        </section>

        {/* 4. 최근 상태 변화 */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">최근 상태 (dashboard)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="text-sm">
              <p className="text-zinc-500">changed</p>
              <p className="font-mono text-zinc-200">{String(trend?.changed ?? "—")}</p>
            </div>
            <div className="text-sm">
              <p className="text-zinc-500">statusCounts</p>
              <pre className="mt-1 overflow-x-auto rounded bg-zinc-950/80 p-2 text-xs text-zinc-300">
                {trend?.statusCounts ? JSON.stringify(trend.statusCounts, null, 2) : "—"}
              </pre>
            </div>
            <div className="sm:col-span-2">
              <p className="text-zinc-500">latestStatuses (최신 먼저)</p>
              <p className="font-mono text-sm text-zinc-200">
                {Array.isArray(trend?.latestStatuses) ? (trend!.latestStatuses as string[]).join(" → ") : "—"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            health-history (최근 {bundle?.healthHistoryRecent?.length ?? 0}줄)
          </h2>
          {(bundle?.healthHistoryRecent?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">데이터 없음</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {[...(bundle!.healthHistoryRecent!)]
                .reverse()
                .map((h, i) => (
                  <li
                    key={`${h.generatedAt}-${i}`}
                    className="flex flex-wrap gap-2 border-b border-zinc-800/80 py-2 last:border-0"
                  >
                    <span className="font-mono text-xs text-zinc-500">{fmtTs(h.generatedAt)}</span>
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-amber-200">{String(h.status ?? "—")}</span>
                    <span className="text-zinc-400">{Array.isArray(h.reasons) ? (h.reasons as string[]).join(", ") : ""}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>

      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="break-words text-sm text-zinc-100">{value}</p>
    </div>
  );
}

function MiniBlock({
  title,
  trades,
  wr,
  pnl
}: {
  title: string;
  trades: unknown;
  wr: unknown;
  pnl: unknown;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
      <p className="text-xs font-medium text-zinc-500">{title}</p>
      <p className="mt-1 text-sm text-zinc-200">trades: {trades !== undefined ? String(trades) : "—"}</p>
      <p className="text-sm text-zinc-200">winRate: {wr !== undefined ? String(wr) : "—"}</p>
      <p className="text-sm text-amber-100/90">PnL: ${fmtNum(pnl, 6)}</p>
    </div>
  );
}
