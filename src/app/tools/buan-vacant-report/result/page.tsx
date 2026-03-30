"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { ReportShell } from "../ReportShell";
import { useBuanReport } from "../BuanReportProvider";
import { buildResultDetail } from "@/lib/buanVacantReport/logic";
import { saveReport } from "@/lib/buanVacantReport/storage";
import type {
  CheckLevel,
  ChecklistKey,
  SavedReport,
} from "@/lib/buanVacantReport/types";

export default function ResultPage() {
  const router = useRouter();
  const { basic, checklist, resetDraft } = useBuanReport();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const result = useMemo(() => buildResultDetail(basic, checklist), [basic, checklist]);

  if (!result) {
    return (
      <ReportShell
        title="진단 결과"
        step="입력이 완료되지 않았습니다"
        backHref="/tools/buan-vacant-report/checklist"
        footer={
          <Link
            href="/tools/buan-vacant-report/checklist"
            className="flex h-14 min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#2f4a38] text-[15px] font-semibold text-white shadow-md"
          >
            체크리스트로 돌아가기
          </Link>
        }
      >
        <p className="rounded-2xl border border-[#dfe6db] bg-white p-5 text-[15px] text-[#4a5545] shadow-sm">
          체크리스트를 모두 선택한 뒤 다시 열어 주세요.
        </p>
      </ReportShell>
    );
  }

  const detail = result;

  function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      const filled = checklist as Record<ChecklistKey, CheckLevel>;
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `r-${Date.now()}`;
      const diagnosedAt = new Date().toISOString();
      const report: SavedReport = {
        id,
        diagnosedAt,
        basic: { ...basic },
        checklist: filled,
        totalScore: detail.totalScore,
        judgmentLabel: detail.judgmentLabel,
        reuseRecommendation: detail.reuseRecommendation,
        result: { ...detail },
      };
      saveReport(report);
      resetDraft();
      router.push("/tools/buan-vacant-report/saved");
    } catch (e) {
      console.error(e);
      setSaveError(
        "저장 용량이 부족할 수 있습니다. 사진 수를 줄이거나 해상도를 낮춘 뒤 다시 시도해 주세요."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ReportShell
      title="진단 결과"
      step="3 / 3 완료"
      backHref="/tools/buan-vacant-report/checklist"
      footer={
        <div className="flex flex-col gap-2">
          {saveError ? (
            <p className="text-center text-[13px] text-[#a14]">{saveError}</p>
          ) : null}
          <div className="flex gap-3">
            <Link
              href="/tools/buan-vacant-report/checklist"
              className="flex h-14 min-h-[52px] flex-1 items-center justify-center rounded-2xl border-2 border-[#b8c4b0] bg-white text-[15px] font-semibold text-[#2d3a2a] active:scale-[0.99]"
            >
              이전
            </Link>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="flex h-14 min-h-[52px] flex-1 items-center justify-center rounded-2xl bg-[#2f4a38] text-[15px] font-semibold text-white shadow-md disabled:opacity-60 active:scale-[0.99]"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <section className="rounded-2xl border-2 border-[#2f4a38] bg-[#e8f0e4] px-5 py-8 text-center shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#3d4a38]">
            종합 판정
          </p>
          <p className="mt-3 text-[26px] font-bold leading-tight tracking-tight text-[#1c2419] sm:text-[28px]">
            {detail.judgmentLabel}
          </p>
          <p className="mt-2 text-[14px] font-medium text-[#4a5545]">
            체크리스트 합산 {detail.totalScore}점 · 20점 만점
          </p>
        </section>

        <ResultRow label="위험도" value={detail.riskLevel} />
        <ResultRow label="정리 난이도" value={detail.cleanupDifficulty} />
        <ResultBlock title="우선 조치사항">
          <ul className="list-inside list-disc space-y-2 text-[14px] leading-relaxed text-[#3d4a38]">
            {detail.priorityActions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </ResultBlock>
        <ResultRow label="재사용 권장 유형" value={detail.reuseRecommendation} />
        <ResultBlock title="예상 작업 범위">
          <p className="text-[14px] leading-relaxed text-[#3d4a38]">
            {detail.workScope}
          </p>
        </ResultBlock>
        <ResultRow label="예상 비용 범위" value={detail.costRange} accent />
        <ResultBlock title="자동 총평">
          <p className="text-[14px] leading-relaxed text-[#2d3a2a]">
            {detail.summary}
          </p>
        </ResultBlock>

        <Link
          href="/tools/buan-vacant-report/saved"
          className="block rounded-xl py-2 text-center text-[13px] font-medium text-[#5c6b56] underline underline-offset-2"
        >
          저장된 리포트 목록 보기
        </Link>
      </div>
    </ReportShell>
  );
}

function ResultRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-[#dfe6db] bg-white p-4 shadow-sm ${
        accent ? "border-[#c5d0be] bg-[#f7faf4]" : ""
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

function ResultBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
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
