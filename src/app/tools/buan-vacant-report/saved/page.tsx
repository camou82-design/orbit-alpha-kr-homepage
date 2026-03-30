"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReportShell } from "../ReportShell";
import { loadReports } from "@/lib/buanVacantReport/storage";
import type { SavedReport } from "@/lib/buanVacantReport/types";

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export default function SavedListPage() {
  const [list, setList] = useState<SavedReport[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후 읽기
    setList(loadReports());
  }, []);

  return (
    <ReportShell
      title="저장된 진단"
      step={`${list.length}건`}
      backHref="/tools/buan-vacant-report"
      footer={
        <Link
          href="/tools/buan-vacant-report/basic"
          className="flex h-14 min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#2f4a38] text-[15px] font-semibold text-white shadow-md active:scale-[0.99]"
        >
          새 진단 작성
        </Link>
      }
    >
      <div className="space-y-3">
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#c5d0be] bg-[#eef1eb] px-5 py-10 text-center text-[15px] text-[#5c6b56]">
            저장된 리포트가 없습니다.
            <br />
            <span className="text-[13px]">시작 화면에서 진단을 완료해 보세요.</span>
          </div>
        ) : (
          list.map((r) => (
            <Link
              key={r.id}
              href={`/tools/buan-vacant-report/saved/${r.id}`}
              className="block rounded-2xl border border-[#dfe6db] bg-white p-4 shadow-sm active:bg-[#f7faf4]"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[16px] font-semibold leading-snug text-[#1c2419]">
                  {r.basic.siteName || "(이름 없음)"}
                </h2>
                <span className="shrink-0 rounded-full bg-[#e8f0e4] px-2.5 py-1 text-[11px] font-semibold text-[#2f4a38]">
                  {r.judgmentLabel}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-[13px] text-[#5c6b56]">
                {r.basic.address || "주소 없음"}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#6b7a65]">
                <span>{formatDate(r.diagnosedAt)}</span>
                <span aria-hidden>·</span>
                <span>
                  권장:{" "}
                  {r.reuseRecommendation.length > 44
                    ? `${r.reuseRecommendation.slice(0, 44)}…`
                    : r.reuseRecommendation}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </ReportShell>
  );
}
