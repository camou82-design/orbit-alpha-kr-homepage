"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReportShell } from "../ReportShell";
import { useBuanReport } from "../BuanReportProvider";
import { compressImageFile } from "@/lib/buanVacantReport/imageCompress";
import {
  CURRENT_STATUS,
  REQUEST_TYPES,
  SPACE_TYPES,
} from "@/lib/buanVacantReport/options";

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mb-1.5 block text-[13px] font-semibold text-[#3d4a38]">
      {children}
      {required ? (
        <span className="ml-1 text-[#8b5a2b]" aria-hidden>
          *
        </span>
      ) : null}
    </label>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#dfe6db] bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[13px] font-semibold text-[#3d4a38]">{title}</h2>
      {children}
    </section>
  );
}

export default function BasicInfoPage() {
  const router = useRouter();
  const { basic, setBasic } = useBuanReport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canNext =
    basic.siteName.trim().length > 0 &&
    basic.address.trim().length > 0 &&
    basic.spaceType &&
    basic.requestType &&
    basic.currentStatus &&
    basic.photos.length >= 3 &&
    basic.photos.length <= 5;

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      const next = [...basic.photos];
      for (let i = 0; i < files.length && next.length < 5; i++) {
        const f = files[i];
        if (!f.type.startsWith("image/")) continue;
        const dataUrl = await compressImageFile(f);
        next.push(dataUrl);
        if (next.length >= 5) break;
      }
      setBasic({ photos: next.slice(0, 5) });
    } catch {
      setError("이미지를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function removePhoto(index: number) {
    setBasic({
      photos: basic.photos.filter((_, i) => i !== index),
    });
  }

  return (
    <ReportShell
      title="현장 기본정보"
      step="1 / 3 입력"
      backHref="/tools/buan-vacant-report"
      footer={
        <div className="flex gap-3">
          <Link
            href="/tools/buan-vacant-report"
            className="flex h-14 min-h-[52px] flex-1 items-center justify-center rounded-2xl border-2 border-[#b8c4b0] bg-white text-[15px] font-semibold text-[#2d3a2a] active:scale-[0.99]"
          >
            이전
          </Link>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => router.push("/tools/buan-vacant-report/checklist")}
            className="flex h-14 min-h-[52px] flex-1 items-center justify-center rounded-2xl bg-[#2f4a38] text-[15px] font-semibold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.99]"
          >
            다음
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Card title="식별">
          <div className="space-y-4">
            <div>
              <FieldLabel required>현장명</FieldLabel>
              <input
                type="text"
                value={basic.siteName}
                onChange={(e) => setBasic({ siteName: e.target.value })}
                placeholder="예: 부안읍 ○○리 단독주택"
                className="w-full rounded-xl border border-[#cfd8c8] bg-[#fafbf9] px-4 py-3.5 text-[16px] outline-none ring-[#2f4a38] placeholder:text-[#8a9585] focus:ring-2"
                autoComplete="off"
              />
            </div>
            <div>
              <FieldLabel required>주소</FieldLabel>
              <textarea
                value={basic.address}
                onChange={(e) => setBasic({ address: e.target.value })}
                placeholder="도로명 또는 지번, 찾기 쉬운 위치까지"
                rows={3}
                className="w-full resize-none rounded-xl border border-[#cfd8c8] bg-[#fafbf9] px-4 py-3.5 text-[16px] outline-none ring-[#2f4a38] placeholder:text-[#8a9585] focus:ring-2"
              />
            </div>
          </div>
        </Card>

        <Card title="분류">
          <div className="space-y-4">
            <div>
              <FieldLabel required>공간 유형</FieldLabel>
              <select
                value={basic.spaceType}
                onChange={(e) => setBasic({ spaceType: e.target.value })}
                className="w-full appearance-none rounded-xl border border-[#cfd8c8] bg-[#fafbf9] px-4 py-3.5 text-[16px] outline-none ring-[#2f4a38] focus:ring-2"
              >
                <option value="">선택</option>
                {SPACE_TYPES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel required>의뢰 유형</FieldLabel>
              <select
                value={basic.requestType}
                onChange={(e) => setBasic({ requestType: e.target.value })}
                className="w-full appearance-none rounded-xl border border-[#cfd8c8] bg-[#fafbf9] px-4 py-3.5 text-[16px] outline-none ring-[#2f4a38] focus:ring-2"
              >
                <option value="">선택</option>
                {REQUEST_TYPES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel required>현재 상태</FieldLabel>
              <select
                value={basic.currentStatus}
                onChange={(e) => setBasic({ currentStatus: e.target.value })}
                className="w-full appearance-none rounded-xl border border-[#cfd8c8] bg-[#fafbf9] px-4 py-3.5 text-[16px] outline-none ring-[#2f4a38] focus:ring-2"
              >
                <option value="">선택</option>
                {CURRENT_STATUS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card title="현장 메모">
          <textarea
            value={basic.memo}
            onChange={(e) => setBasic({ memo: e.target.value })}
            placeholder="누수, 동선, 주변 환경 등 자유롭게 기록"
            rows={4}
            className="w-full resize-none rounded-xl border border-[#cfd8c8] bg-[#fafbf9] px-4 py-3.5 text-[16px] outline-none ring-[#2f4a38] placeholder:text-[#8a9585] focus:ring-2"
          />
        </Card>

        <Card title="현장 사진 (3~5장)">
          <p className="mb-3 text-[13px] leading-relaxed text-[#5c6b56]">
            전경·출입부·내부가 보이도록 남겨 주세요. 자동으로 용량을 줄여
            저장합니다.
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#b8c4b0] bg-[#f4f7f1] px-4 py-8 text-center active:bg-[#eef1eb]">
            <span className="text-[14px] font-semibold text-[#2d3a2a]">
              {busy ? "처리 중…" : "사진 추가 (갤러리)"}
            </span>
            <span className="mt-1 text-[12px] text-[#6b7a65]">
              {basic.photos.length}/5장 · 최소 3장 필요
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={busy || basic.photos.length >= 5}
              onChange={(e) => {
                void onPickFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {error ? (
            <p className="mt-2 text-[13px] text-[#a14]">{error}</p>
          ) : null}
          {basic.photos.length > 0 ? (
            <ul className="mt-4 grid grid-cols-3 gap-2">
              {basic.photos.map((src, i) => (
                <li key={i} className="relative aspect-square overflow-hidden rounded-lg border border-[#dfe6db]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`현장 ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute right-1 top-1 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-white"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
    </ReportShell>
  );
}
