"use client";

import Link from "next/link";
import { ClipboardList, FolderOpen } from "lucide-react";
import { ReportShell } from "./ReportShell";

export default function BuanVacantStartPage() {
  return (
    <ReportShell
      title="부안 빈집 현장진단"
      step="현장 기록 · 자동 판정 · 리포트 저장"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/tools/buan-vacant-report/saved"
            className="flex h-14 min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-[#b8c4b0] bg-white text-[15px] font-semibold text-[#2d3a2a] shadow-sm active:scale-[0.99]"
          >
            <FolderOpen className="h-5 w-5" />
            저장 목록
          </Link>
          <Link
            href="/tools/buan-vacant-report/basic"
            className="flex h-14 min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#2f4a38] text-[15px] font-semibold text-white shadow-md active:scale-[0.99]"
          >
            <ClipboardList className="h-5 w-5" />
            진단 시작
          </Link>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#dfe6db] bg-white p-6 shadow-sm">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[#5c6b56]">
            부안 빈집 현장진단 리포트
          </p>
          <h2 className="mt-2 text-[22px] font-bold leading-snug tracking-tight text-[#1c2419]">
            현장에서 빠르게 기록하고,
            <br />
            같은 기준으로 결과를 정리합니다.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#4a5545]">
            체크리스트 점수로 종합 판정과 조치 방향을 자동 제시합니다. 로그인 없이
            이 기기에만 저장됩니다.
          </p>
        </div>

        <div className="rounded-2xl border border-dashed border-[#c5d0be] bg-[#eef1eb] px-5 py-4 text-[13px] leading-relaxed text-[#4a5545]">
          사진 3장 이상, 체크리스트 5항목을 모두 선택하면 진단 결과를 확인할 수
          있습니다.
        </div>
      </div>
    </ReportShell>
  );
}
