"use client";

import { useEffect, useMemo, useState } from "react";

type ScreeningStatus = "APPROVED_CANDIDATE" | "WATCHLIST" | "REVIEW_ONLY" | "REJECTED";

type FormState = {
  productName: string;
  sourceUrl: string;
  sourcePrice: number;
  salePrice: number;
  overseasShipping: number;
  domesticShipping: number;
  platformFeeRate: number;
  optionCount: number;
  supplierScore: number;
  marketSignals: string[];
  memo: string;
};

type AnalysisResult = {
  status: ScreeningStatus;
  label: string;
  badgeClass: string;
  panelClass: string;
  summary: string;
  nextAction: string;
  totalCost: number;
  margin: number;
  marginRate: number;
  riskScore: number;
  hardHits: string[];
  reviewHits: string[];
  passedReasons: string[];
  failedReasons: string[];
};

type Candidate = FormState & {
  id: string;
  createdAt: string;
  result: AnalysisResult;
};

const STORAGE_KEY = "orbitalpha-purchase-agent-candidates";

const defaultForm: FormState = {
  productName: "",
  sourceUrl: "",
  sourcePrice: 15000,
  salePrice: 32000,
  overseasShipping: 3500,
  domesticShipping: 3000,
  platformFeeRate: 6,
  optionCount: 2,
  supplierScore: 90,
  marketSignals: ["국내 수요 확인", "상세 이미지 충분", "가격 차익 있음"],
  memo: "",
};

const sampleForm: FormState = {
  productName: "무선 충전식 LED 작업등 배터리 포함",
  sourceUrl: "https://example.com/sample-product",
  sourcePrice: 18000,
  salePrice: 42000,
  overseasShipping: 5000,
  domesticShipping: 3000,
  platformFeeRate: 6,
  optionCount: 4,
  supplierScore: 82,
  marketSignals: ["국내 수요 확인", "가격 차익 있음"],
  memo: "KC, 배터리, 충전 관련 문구가 있어 바로 판매 등록하지 말고 인증 검토 필요",
};

const hardRiskKeywords = [
  "kc",
  "전기",
  "충전",
  "배터리",
  "리튬",
  "어댑터",
  "220v",
  "식품",
  "식기",
  "의료",
  "치료",
  "화장품",
  "영유아",
  "어린이",
  "장난감",
  "브랜드",
  "정품",
  "샤넬",
  "루이비통",
  "나이키",
  "아디다스",
  "디즈니",
];

const reviewKeywords = [
  "유리",
  "세라믹",
  "파손",
  "대형",
  "설치",
  "조립",
  "사이즈",
  "색상",
  "의류",
  "신발",
  "원목",
  "가죽",
  "옵션",
  "반품",
  "해외배송",
];

const marketSignalOptions = [
  "국내 수요 확인",
  "상세 이미지 충분",
  "가격 차익 있음",
  "리뷰/판매량 확인",
  "옵션 단순함",
  "파손 위험 낮음",
];

const statusMeta: Record<ScreeningStatus, Pick<AnalysisResult, "label" | "badgeClass" | "panelClass">> = {
  APPROVED_CANDIDATE: {
    label: "판매 후보",
    badgeClass: "border-emerald-400/40 bg-emerald-400/12 text-emerald-200",
    panelClass: "border-emerald-400/30 bg-emerald-400/10",
  },
  WATCHLIST: {
    label: "관찰 후보",
    badgeClass: "border-cyan-300/40 bg-cyan-300/12 text-cyan-100",
    panelClass: "border-cyan-300/25 bg-cyan-300/10",
  },
  REVIEW_ONLY: {
    label: "수기 검토",
    badgeClass: "border-amber-300/45 bg-amber-300/12 text-amber-100",
    panelClass: "border-amber-300/30 bg-amber-300/10",
  },
  REJECTED: {
    label: "탈락",
    badgeClass: "border-rose-400/45 bg-rose-400/12 text-rose-100",
    panelClass: "border-rose-400/30 bg-rose-400/10",
  },
};

function toNumber(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return Math.round(value).toLocaleString("ko-KR") + "원";
}

function findHits(text: string, keywords: string[]) {
  const source = text.toLowerCase();
  return keywords.filter((keyword) => source.includes(keyword.toLowerCase()));
}

function analyze(form: FormState): AnalysisResult {
  const text = [form.productName, form.memo, form.sourceUrl].join(" ");
  const hardHits = findHits(text, hardRiskKeywords);
  const reviewHits = findHits(text, reviewKeywords).filter((item) => !hardHits.includes(item));
  const platformFee = form.salePrice * (form.platformFeeRate / 100);
  const totalCost = form.sourcePrice + form.overseasShipping + form.domesticShipping + platformFee;
  const margin = form.salePrice - totalCost;
  const marginRate = form.salePrice > 0 ? (margin / form.salePrice) * 100 : 0;

  const failedReasons: string[] = [];
  const passedReasons: string[] = [];

  if (!form.productName.trim()) failedReasons.push("상품명이 비어 있습니다.");
  if (hardHits.length) failedReasons.push("KC·전기·배터리·식품·브랜드 등 고위험 키워드가 감지되었습니다.");
  if (reviewHits.length) failedReasons.push("파손·사이즈·옵션·반품 관련 검토 키워드가 있습니다.");
  if (margin <= 0) failedReasons.push("계산상 이익이 남지 않습니다.");
  else if (marginRate < 20) failedReasons.push("마진율이 20% 미만입니다.");
  else if (marginRate >= 30) passedReasons.push("마진율 30% 이상 기준을 통과했습니다.");
  else passedReasons.push("마진은 남지만 승인 기준에는 조금 부족합니다.");

  if (form.optionCount <= 3) passedReasons.push("옵션 수가 3개 이하라 CS 부담이 낮습니다.");
  else failedReasons.push("옵션 수가 많아 오배송·색상·사이즈 CS 가능성이 있습니다.");

  if (form.supplierScore >= 90) passedReasons.push("공급사 점수 90점 이상입니다.");
  else if (form.supplierScore < 75) failedReasons.push("공급사 점수가 낮아 품절·배송·품질 리스크가 큽니다.");
  else failedReasons.push("공급사 점수는 추가 확인이 필요합니다.");

  if (form.marketSignals.length >= 3) passedReasons.push("시장성 확인 항목이 3개 이상입니다.");
  else failedReasons.push("시장성 확인 항목이 부족합니다.");

  let riskScore = 0;
  riskScore += hardHits.length * 24;
  riskScore += reviewHits.length * 8;
  riskScore += Math.max(0, form.optionCount - 3) * 8;
  riskScore += form.supplierScore < 90 ? Math.min(30, 90 - form.supplierScore) : 0;
  riskScore += marginRate < 30 ? Math.min(28, 30 - marginRate) : 0;
  riskScore += form.marketSignals.length < 3 ? (3 - form.marketSignals.length) * 8 : 0;
  riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));

  let status: ScreeningStatus;
  if (!form.productName.trim() || hardHits.length > 0 || margin <= 0 || marginRate < 10 || form.supplierScore < 70) {
    status = "REJECTED";
  } else if (marginRate >= 30 && form.optionCount <= 3 && form.supplierScore >= 90 && form.marketSignals.length >= 3 && reviewHits.length === 0) {
    status = "APPROVED_CANDIDATE";
  } else if (marginRate >= 20 && form.supplierScore >= 80 && form.marketSignals.length >= 2 && hardHits.length === 0) {
    status = "WATCHLIST";
  } else {
    status = "REVIEW_ONLY";
  }

  const summaryByStatus: Record<ScreeningStatus, string> = {
    APPROVED_CANDIDATE: "자동등록 전 최종 확인 후보입니다. 상세페이지·가격 변동·재고만 한번 더 보면 됩니다.",
    WATCHLIST: "바로 등록하기보다는 가격·공급사·경쟁상품을 며칠 더 관찰할 후보입니다.",
    REVIEW_ONLY: "사람이 직접 확인해야 합니다. CS, 인증, 파손, 옵션 문제를 먼저 봐야 합니다.",
    REJECTED: "현재 기준에서는 판매하지 않는 쪽이 안전합니다. 인증·상표·마진·공급사 리스크가 큽니다.",
  };

  const nextActionByStatus: Record<ScreeningStatus, string> = {
    APPROVED_CANDIDATE: "승인 후보 저장 후 상세페이지 초안 작성",
    WATCHLIST: "가격·리뷰·공급사 변동 2~3일 관찰",
    REVIEW_ONLY: "KC/통관/파손/옵션 기준 수기 확인",
    REJECTED: "등록 보류 또는 대체 상품 탐색",
  };

  return {
    status,
    ...statusMeta[status],
    summary: summaryByStatus[status],
    nextAction: nextActionByStatus[status],
    totalCost,
    margin,
    marginRate,
    riskScore,
    hardHits,
    reviewHits,
    passedReasons,
    failedReasons,
  };
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return '"' + text + '"';
}

export default function PurchaseAgentPage() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const result = useMemo(() => analyze(form), [form]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setCandidates(JSON.parse(saved));
    } catch {
      // localStorage is optional. Ignore parse errors.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(candidates));
    } catch {
      // localStorage is optional. Ignore quota errors.
    }
  }, [candidates]);

  const updateField = (key: keyof FormState, value: string | number | string[]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleMarketSignal = (signal: string) => {
    setForm((current) => {
      const exists = current.marketSignals.includes(signal);
      return {
        ...current,
        marketSignals: exists
          ? current.marketSignals.filter((item) => item !== signal)
          : [...current.marketSignals, signal],
      };
    });
  };

  const saveCandidate = () => {
    const item: Candidate = {
      ...form,
      id: Date.now().toString(),
      createdAt: new Date().toLocaleString("ko-KR"),
      result,
    };
    setCandidates((current) => [item, ...current].slice(0, 30));
  };

  const exportCsv = () => {
    if (candidates.length === 0) return;
    const headers = [
      "저장일",
      "상품명",
      "판정",
      "마진율",
      "예상마진",
      "총원가",
      "판매가",
      "위험점수",
      "고위험키워드",
      "검토키워드",
      "다음조치",
      "URL",
      "메모",
    ];
    const rows = candidates.map((item) => [
      item.createdAt,
      item.productName,
      item.result.label,
      item.result.marginRate.toFixed(1) + "%",
      Math.round(item.result.margin),
      Math.round(item.result.totalCost),
      Math.round(item.salePrice),
      item.result.riskScore,
      item.result.hardHits.join(" / "),
      item.result.reviewHits.join(" / "),
      item.result.nextAction,
      item.sourceUrl,
      item.memo,
    ]);
    const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "purchase-agent-screening.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-[#030509] text-white">
      <section className="relative overflow-hidden py-12 lg:py-20">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_10%,rgba(0,242,255,0.16),transparent_28%),radial-gradient(circle_at_86%_12%,rgba(255,215,0,0.14),transparent_26%),linear-gradient(180deg,#030509_0%,#0A0F1E_100%)]" />
        <div className="relative z-10 max-w-[1440px] mx-auto px-6 lg:px-10">
          <a href="/tools" className="inline-flex items-center gap-2 text-[12px] font-black tracking-[0.22em] uppercase text-[#00F2FF] mb-8">
            OrbitAlpha / Tools
          </a>

          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-8 lg:gap-10 items-start">
            <div>
              <div className="text-[#FFD700] text-[12px] font-black tracking-[0.32em] uppercase mb-5">
                Purchase Agent Screening MVP
              </div>
              <h1 className="text-[34px] lg:text-[58px] font-black leading-[1.12] tracking-tight mb-6">
                구매대행 상품을<br className="hidden lg:block" /> 먼저 걸러내는 심사기
              </h1>
              <p className="max-w-[760px] text-[#CBD5E1] text-[16px] lg:text-[18px] leading-8 font-medium">
                상품 URL이나 이름을 넣고 원가·판매가·옵션·공급사 점수를 입력하면 판매 후보, 관찰 후보, 수기 검토, 탈락으로 나눕니다. 지금 단계는 자동등록 전 위험 상품을 먼저 죽이는 1차 필터입니다.
              </p>

              <div className="mt-8 grid sm:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] text-[#94A3B8] font-black tracking-widest uppercase">Decision</div>
                  <div className="mt-2 text-[18px] font-black text-[#FFD700]">4단계 판정</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] text-[#94A3B8] font-black tracking-widest uppercase">Margin</div>
                  <div className="mt-2 text-[18px] font-black text-[#00F2FF]">실마진 계산</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] text-[#94A3B8] font-black tracking-widest uppercase">Risk</div>
                  <div className="mt-2 text-[18px] font-black text-white">키워드 차단</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] text-[#94A3B8] font-black tracking-widest uppercase">Export</div>
                  <div className="mt-2 text-[18px] font-black text-white">CSV 저장</div>
                </div>
              </div>
            </div>

            <div className={"rounded-[30px] border p-6 lg:p-7 shadow-[0_30px_90px_rgba(0,0,0,0.35)] " + result.panelClass}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <span className={"inline-flex rounded-full border px-4 py-2 text-[12px] font-black tracking-[0.18em] uppercase " + result.badgeClass}>
                  {result.label}
                </span>
                <span className="text-[12px] font-black tracking-[0.2em] text-white/45 uppercase">Risk {result.riskScore}/100</span>
              </div>

              <div className="text-[36px] lg:text-[50px] font-black tracking-tight mb-2">
                {result.marginRate.toFixed(1)}%
              </div>
              <div className="text-[#CBD5E1] font-bold mb-6">예상 마진율 · 예상 마진 {money(result.margin)}</div>
              <p className="text-[15px] leading-7 text-[#E2E8F0] mb-6">{result.summary}</p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="rounded-2xl bg-black/30 border border-white/10 p-4">
                  <div className="text-[11px] text-[#94A3B8] font-black uppercase tracking-widest">총원가</div>
                  <div className="mt-1 text-[18px] font-black">{money(result.totalCost)}</div>
                </div>
                <div className="rounded-2xl bg-black/30 border border-white/10 p-4">
                  <div className="text-[11px] text-[#94A3B8] font-black uppercase tracking-widest">다음 조치</div>
                  <div className="mt-1 text-[14px] font-black text-[#FFD700] leading-6">{result.nextAction}</div>
                </div>
              </div>

              <div className="space-y-3">
                {result.failedReasons.slice(0, 4).map((reason) => (
                  <div key={reason} className="rounded-2xl border border-rose-300/15 bg-rose-300/8 px-4 py-3 text-[13px] leading-6 text-rose-50">
                    × {reason}
                  </div>
                ))}
                {result.passedReasons.slice(0, 3).map((reason) => (
                  <div key={reason} className="rounded-2xl border border-emerald-300/15 bg-emerald-300/8 px-4 py-3 text-[13px] leading-6 text-emerald-50">
                    ✓ {reason}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-16 lg:pb-24">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10 grid lg:grid-cols-[0.95fr_1.05fr] gap-8 lg:gap-10 items-start">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.06] p-6 lg:p-8 shadow-[0_30px_90px_rgba(0,0,0,0.25)]">
            <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.28em] uppercase mb-5">Input</div>
            <div className="space-y-5">
              <label className="block">
                <span className="block text-[13px] font-black text-[#CBD5E1] mb-2">상품명 / 핵심 키워드</span>
                <input
                  value={form.productName}
                  onChange={(event) => updateField("productName", event.target.value)}
                  placeholder="예: 무타공 욕실 선반, 작업용 장갑, 충전식 공구 등"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 text-white outline-none focus:border-[#00F2FF]/60"
                />
              </label>

              <label className="block">
                <span className="block text-[13px] font-black text-[#CBD5E1] mb-2">상품 URL</span>
                <input
                  value={form.sourceUrl}
                  onChange={(event) => updateField("sourceUrl", event.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 text-white outline-none focus:border-[#00F2FF]/60"
                />
              </label>

              <div className="grid sm:grid-cols-2 gap-4">
                <NumberField label="공급가" value={form.sourcePrice} onChange={(value) => updateField("sourcePrice", value)} />
                <NumberField label="예상 판매가" value={form.salePrice} onChange={(value) => updateField("salePrice", value)} />
                <NumberField label="해외 배송비" value={form.overseasShipping} onChange={(value) => updateField("overseasShipping", value)} />
                <NumberField label="국내 배송비" value={form.domesticShipping} onChange={(value) => updateField("domesticShipping", value)} />
                <NumberField label="플랫폼 수수료 %" value={form.platformFeeRate} onChange={(value) => updateField("platformFeeRate", value)} />
                <NumberField label="옵션 수" value={form.optionCount} onChange={(value) => updateField("optionCount", value)} />
                <NumberField label="공급사 점수" value={form.supplierScore} onChange={(value) => updateField("supplierScore", value)} />
              </div>

              <div>
                <div className="text-[13px] font-black text-[#CBD5E1] mb-3">시장성 확인</div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {marketSignalOptions.map((signal) => {
                    const active = form.marketSignals.includes(signal);
                    return (
                      <button
                        key={signal}
                        type="button"
                        onClick={() => toggleMarketSignal(signal)}
                        className={
                          "rounded-2xl border px-4 py-3 text-left text-[13px] font-bold transition-all " +
                          (active
                            ? "border-[#00F2FF]/55 bg-[#00F2FF]/12 text-[#BDF8FF]"
                            : "border-white/10 bg-black/20 text-[#94A3B8] hover:border-white/25")
                        }
                      >
                        {active ? "✓ " : "+ "}{signal}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <span className="block text-[13px] font-black text-[#CBD5E1] mb-2">메모 / 상세 설명</span>
                <textarea
                  value={form.memo}
                  onChange={(event) => updateField("memo", event.target.value)}
                  rows={4}
                  placeholder="상세페이지 문구, 인증 의심 키워드, 파손 가능성, 옵션 구성 등을 적어두면 위험 키워드를 같이 봅니다."
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 text-white outline-none focus:border-[#00F2FF]/60"
                />
              </label>

              <div className="flex flex-wrap gap-3 pt-2">
                <button type="button" onClick={saveCandidate} className="rounded-2xl bg-[#FFD700] px-5 py-3 text-[14px] font-black text-black hover:brightness-110">
                  후보 저장
                </button>
                <button type="button" onClick={() => setForm(sampleForm)} className="rounded-2xl border border-[#00F2FF]/35 bg-[#00F2FF]/10 px-5 py-3 text-[14px] font-black text-[#BDF8FF]">
                  샘플 넣기
                </button>
                <button type="button" onClick={() => setForm(defaultForm)} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-[14px] font-black text-white/80">
                  초기화
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.06] p-6 lg:p-8 shadow-[0_30px_90px_rgba(0,0,0,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.28em] uppercase mb-2">Saved Candidates</div>
                <h2 className="text-[24px] lg:text-[30px] font-black">심사 기록</h2>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={exportCsv} className="rounded-2xl border border-[#FFD700]/35 bg-[#FFD700]/10 px-4 py-3 text-[13px] font-black text-[#FFD700] disabled:opacity-40" disabled={candidates.length === 0}>
                  CSV 내보내기
                </button>
                <button type="button" onClick={() => setCandidates([])} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[13px] font-black text-white/60">
                  비우기
                </button>
              </div>
            </div>

            {candidates.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-[#94A3B8] leading-7">
                아직 저장된 후보가 없습니다. 왼쪽에서 상품을 심사하고 후보 저장을 누르면 여기에 쌓입니다.
              </div>
            ) : (
              <div className="space-y-4">
                {candidates.map((item) => (
                  <div key={item.id} className="rounded-3xl border border-white/10 bg-black/25 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="text-[11px] text-[#64748B] font-bold mb-1">{item.createdAt}</div>
                        <div className="text-[17px] font-black leading-6">{item.productName || "상품명 없음"}</div>
                      </div>
                      <span className={"rounded-full border px-3 py-1.5 text-[11px] font-black tracking-widest " + item.result.badgeClass}>
                        {item.result.label}
                      </span>
                    </div>
                    <div className="grid sm:grid-cols-4 gap-3 text-[13px]">
                      <MiniStat label="마진율" value={item.result.marginRate.toFixed(1) + "%"} />
                      <MiniStat label="예상마진" value={money(item.result.margin)} />
                      <MiniStat label="위험점수" value={String(item.result.riskScore)} />
                      <MiniStat label="다음조치" value={item.result.nextAction} />
                    </div>
                    {(item.result.hardHits.length > 0 || item.result.reviewHits.length > 0) && (
                      <div className="mt-4 text-[12px] leading-6 text-[#CBD5E1]">
                        감지 키워드: {[...item.result.hardHits, ...item.result.reviewHits].join(" / ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-black text-[#94A3B8] mb-2">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={String(value)}
        onChange={(event) => onChange(toNumber(event.target.value))}
        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[#00F2FF]/60"
      />
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#64748B] mb-1">{label}</div>
      <div className="text-[13px] font-black text-white leading-5">{value}</div>
    </div>
  );
}
