"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReportShell } from "../ReportShell";
import { useBuanReport } from "../BuanReportProvider";
import {
  CHECK_LABELS,
  CHECKLIST_ITEMS,
  type CheckLevel,
  type ChecklistKey,
} from "@/lib/buanVacantReport/types";
import clsx from "clsx";

const LEVELS: CheckLevel[] = ["good", "normal", "bad"];

export default function ChecklistPage() {
  const router = useRouter();
  const { checklist, setChecklist } = useBuanReport();

  const complete =
    checklist.structure !== null &&
    checklist.pollution !== null &&
    checklist.electric !== null &&
    checklist.access !== null &&
    checklist.reuse !== null;

  return (
    <ReportShell
      title="현장 체크리스트"
      step="2 / 3 입력"
      backHref="/tools/buan-vacant-report/basic"
      footer={
        <div className="flex gap-3">
          <Link
            href="/tools/buan-vacant-report/basic"
            className="flex h-14 min-h-[52px] flex-1 items-center justify-center rounded-2xl border-2 border-[#b8c4b0] bg-white text-[15px] font-semibold text-[#2d3a2a] active:scale-[0.99]"
          >
            이전
          </Link>
          <button
            type="button"
            disabled={!complete}
            onClick={() => router.push("/tools/buan-vacant-report/result")}
            className="flex h-14 min-h-[52px] flex-1 items-center justify-center rounded-2xl bg-[#2f4a38] text-[15px] font-semibold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.99]"
          >
            다음
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="rounded-2xl border border-[#dfe6db] bg-white px-4 py-3 text-[13px] leading-relaxed text-[#4a5545] shadow-sm">
          각 항목을 현장에서 본 그대로 선택합니다.{" "}
          <span className="font-semibold text-[#2d3a2a]">양호·보통·불량</span>은
          점수에 반영됩니다.
        </p>

        {CHECKLIST_ITEMS.map(({ key, label }) => (
          <section
            key={key}
            className="rounded-2xl border border-[#dfe6db] bg-white p-4 shadow-sm"
          >
            <h2 className="mb-3 text-[14px] font-semibold text-[#1c2419]">
              {label}
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {LEVELS.map((lv) => {
                const selected = checklist[key] === lv;
                return (
                  <button
                    key={lv}
                    type="button"
                    onClick={() =>
                      setChecklist({ [key]: lv } as Partial<
                        Record<ChecklistKey, CheckLevel>
                      >)
                    }
                    className={clsx(
                      "min-h-[48px] rounded-xl border-2 px-2 py-3 text-[14px] font-semibold transition-colors active:scale-[0.98]",
                      selected
                        ? "border-[#2f4a38] bg-[#e8f0e4] text-[#1c2419]"
                        : "border-[#cfd8c8] bg-[#fafbf9] text-[#4a5545]"
                    )}
                  >
                    {CHECK_LABELS[lv]}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </ReportShell>
  );
}
