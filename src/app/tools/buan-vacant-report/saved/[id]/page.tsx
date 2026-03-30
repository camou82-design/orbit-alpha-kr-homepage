"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { ReportShell } from "../../ReportShell";
import { getReportById } from "@/lib/buanVacantReport/storage";
import { CHECK_LABELS, CHECKLIST_ITEMS } from "@/lib/buanVacantReport/types";

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export default function SavedDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const report = useMemo(() => {
    if (!id) return null;
    return getReportById(id) ?? null;
  }, [id]);

  if (report === null) {
    return (
      <ReportShell
        title="저장 리포트"
        step="찾을 수 없음"
        backHref="/tools/buan-vacant-report/saved"
        footer={
          <Link
            href="/tools/buan-vacant-report/saved"
            className="flex h-14 min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#2f4a38] text-[15px] font-semibold text-white"
          >
            목록으로
          </Link>
        }
      >
        <p className="rounded-2xl border border-[#dfe6db] bg-white p-6 text-[15px] text-[#4a5545] shadow-sm">
          삭제되었거나 이 기기에 없는 리포트입니다.
        </p>
      </ReportShell>
    );
  }

  const r = report;
  const res = r.result;

  return (
    <ReportShell
      title="저장 리포트"
      step={formatDate(r.diagnosedAt)}
      backHref="/tools/buan-vacant-report/saved"
      footer={
        <Link
          href="/tools/buan-vacant-report/saved"
          className="flex h-14 min-h-[52px] w-full items-center justify-center rounded-2xl border-2 border-[#b8c4b0] bg-white text-[15px] font-semibold text-[#2d3a2a] active:scale-[0.99]"
        >
          목록으로
        </Link>
      }
    >
      <div className="space-y-4">
        <section className="rounded-2xl border-2 border-[#2f4a38] bg-[#e8f0e4] px-5 py-8 text-center shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#3d4a38]">
            종합 판정
          </p>
          <p className="mt-3 text-[26px] font-bold leading-tight text-[#1c2419] sm:text-[28px]">
            {res.judgmentLabel}
          </p>
          <p className="mt-2 text-[14px] font-medium text-[#4a5545]">
            합산 {res.totalScore}점
          </p>
        </section>

        <section className="rounded-2xl border border-[#dfe6db] bg-white p-4 shadow-sm">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5c6b56]">
            현장 요약
          </h2>
          <dl className="mt-3 space-y-2 text-[14px]">
            <div>
              <dt className="text-[12px] text-[#6b7a65]">현장명</dt>
              <dd className="font-semibold text-[#1c2419]">
                {r.basic.siteName || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#6b7a65]">주소</dt>
              <dd className="whitespace-pre-wrap text-[#2d3a2a]">
                {r.basic.address || "—"}
              </dd>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <dt className="text-[12px] text-[#6b7a65]">공간 유형</dt>
                <dd>{r.basic.spaceType || "—"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[#6b7a65]">의뢰 유형</dt>
                <dd>{r.basic.requestType || "—"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[#6b7a65]">현재 상태</dt>
                <dd>{r.basic.currentStatus || "—"}</dd>
              </div>
            </div>
            {r.basic.memo ? (
              <div>
                <dt className="text-[12px] text-[#6b7a65]">메모</dt>
                <dd className="whitespace-pre-wrap text-[#3d4a38]">
                  {r.basic.memo}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        {r.basic.photos.length > 0 ? (
          <section className="rounded-2xl border border-[#dfe6db] bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5c6b56]">
              현장 사진
            </h2>
            <ul className="grid grid-cols-3 gap-2">
              {r.basic.photos.map((src, i) => (
                <li
                  key={i}
                  className="aspect-square overflow-hidden rounded-lg border border-[#dfe6db]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`현장 ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-2xl border border-[#dfe6db] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5c6b56]">
            체크리스트 기록
          </h2>
          <ul className="space-y-2 text-[14px]">
            {CHECKLIST_ITEMS.map(({ key, label }) => (
              <li
                key={key}
                className="flex items-center justify-between gap-2 border-b border-[#eef1eb] py-2 last:border-0"
              >
                <span className="text-[#3d4a38]">{label}</span>
                <span className="font-semibold text-[#1c2419]">
                  {CHECK_LABELS[r.checklist[key]]}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <DetailRow label="위험도" value={res.riskLevel} />
        <DetailRow label="정리 난이도" value={res.cleanupDifficulty} />
        <DetailBlock title="우선 조치사항">
          <ul className="list-inside list-disc space-y-2 text-[14px] leading-relaxed text-[#3d4a38]">
            {res.priorityActions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </DetailBlock>
        <DetailRow label="재사용 권장 유형" value={res.reuseRecommendation} />
        <DetailBlock title="예상 작업 범위">
          <p className="text-[14px] leading-relaxed text-[#3d4a38]">
            {res.workScope}
          </p>
        </DetailBlock>
        <DetailRow label="예상 비용 범위" value={res.costRange} highlight />
        <DetailBlock title="자동 총평">
          <p className="text-[14px] leading-relaxed text-[#2d3a2a]">
            {res.summary}
          </p>
        </DetailBlock>
      </div>
    </ReportShell>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border p-4 shadow-sm ${
        highlight
          ? "border-[#c5d0be] bg-[#f7faf4]"
          : "border-[#dfe6db] bg-white"
      }`}
    >
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5c6b56]">
        {label}
      </h2>
      <p className="mt-2 text-[16px] font-semibold leading-snug text-[#1c2419]">
        {value}
      </p>
    </section>
  );
}

function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#dfe6db] bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5c6b56]">
        {title}
      </h2>
      {children}
    </section>
  );
}
