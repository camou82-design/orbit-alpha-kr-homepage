"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { parse1688DumpText, ParseResult } from './parser';

// 시장성 확인 체크 항목 타입
interface Marketability {
  domesticDemand: boolean;      // 국내 수요 확인
  detailImageEnough: boolean;   // 상세 이미지 충분
  priceGapExists: boolean;      // 가격 차익 있음
  reviewVolumeChecked: boolean; // 리뷰/판매량 확인
  optionSimple: boolean;         // 옵션 단순함
  lowDamageRisk: boolean;        // 파손 위험 낮음
}

// 폼 입력 데이터 타입
interface FormData {
  productName: string;
  productUrl: string;
  supplyPrice: number;
  sellingPrice: number;
  intlShipping: number;
  localShipping: number;
  platformFeePercent: number;
  optionCount: number;
  supplierScore: number;
  marketability: Marketability;
  memo: string;
}

// 판정 결과 타입
type DecisionType = 'APPROVED_CANDIDATE' | 'WATCHLIST' | 'REVIEW_ONLY' | 'REJECTED';

// 저장된 후보 아이템 타입
interface CandidateItem {
  id: string;
  savedAt: string; // KST 포맷 날짜 스트링
  formData: FormData;
  decision: DecisionType;
  margin: number;
  marginPercent: number;
  totalCost: number;
  riskScore: number;
  nextAction: string;
}

// 고위험 키워드 & 검토 키워드 정의
const HIGH_RISK_KEYWORDS = [
  'kc', '전기', '충전', '배터리', '리튬', '어댑터', '220v', '식품', '식기', '의료', 
  '치료', '화장품', '영유아', '어린이', '장난감', '브랜드', '정품', '샤넬', '루이비통', 
  '나이키', '아디다스', '디즈니'
];

const REVIEW_KEYWORDS = [
  '유리', '세라믹', '파손', '대형', '설치', '조립', '사이즈', '색상', '의류', 
  '신발', '원목', '가죽', '옵션', '반품', '해외배송'
];

const INITIAL_FORM_DATA: FormData = {
  productName: '',
  productUrl: '',
  supplyPrice: 0,
  sellingPrice: 0,
  intlShipping: 0,
  localShipping: 0,
  platformFeePercent: 10, // 플랫폼 기본 수수료 10%
  optionCount: 1,
  supplierScore: 80, // 공급사 점수 기본 80점
  marketability: {
    domesticDemand: false,
    detailImageEnough: false,
    priceGapExists: false,
    reviewVolumeChecked: false,
    optionSimple: false,
    lowDamageRisk: false,
  },
  memo: '',
};

export default function PurchaseAgentPage() {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 2차 작업: 수동 덤프 파싱 상태
  const [rawDumpText, setRawDumpText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [dumpError, setDumpError] = useState('');

  // hydration 에러 방지를 위한 마운트 체크 및 로컬스토리지 데이터 로드
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
      const stored = localStorage.getItem('orbit_screening_candidates');
      if (stored) {
        try {
          setCandidates(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to parse candidates from localStorage', e);
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleDumpAnalysis = () => {
    setDumpError('');
    if (!rawDumpText.trim()) {
      setDumpError('분석할 텍스트를 입력해주세요.');
      setParseResult(null);
      return;
    }

    try {
      const result = parse1688DumpText(rawDumpText);
      setParseResult(result);

      // 기존 폼 상태 자동 반영
      setFormData((prev) => {
        const updated = { ...prev };
        
        if (result.titleCandidate && result.titleCandidate !== '수기 입력 필요') {
          updated.productName = result.titleCandidate;
        }
        
        // 최저 위안화 공급가 주입
        if (result.priceMin !== null) {
          updated.supplyPrice = result.priceMin;
        }

        if (result.optionCountEstimated !== null) {
          updated.optionCount = result.optionCountEstimated;
        }

        // 메모 란에 위안화 원문 및 요약 기록 (수기 변환 지침 추가)
        const priceRangeInfo = result.priceMin !== null 
          ? `[1688 위안화 가격 후보: 최저 ¥${result.priceMin} ~ 최고 ¥${result.priceMax || result.priceMin} (원화 수기 변환 필요)]`
          : '[1688 가격 후보 감지 실패: 공급가 수기 확인 필요]';
        const optionInfo = result.optionStatus === 'DETECTED' 
          ? `[추정 옵션 수: ${result.optionCountEstimated}개]` 
          : '[옵션 감지 불확실: 수기 확인 필요]';

        const summaryText = result.summaryText ? `\n[원문 요약]: ${result.summaryText}` : '';

        // 위험/검토 키워드가 발견되었을 때 메모 란에 경고 삽입
        const warningInfo = [];
        if (result.foundHighRiskKeywords.length > 0) {
          warningInfo.push(`[고위험 키워드 감지: ${result.foundHighRiskKeywords.join(', ')}]`);
        }
        if (result.foundReviewKeywords.length > 0) {
          warningInfo.push(`[검토 키워드 감지: ${result.foundReviewKeywords.join(', ')}]`);
        }
        const warningText = warningInfo.length > 0 ? `\n${warningInfo.join('\n')}` : '';

        updated.memo = `${priceRangeInfo}\n${optionInfo}${warningText}${summaryText}\n\n${prev.memo}`.trim();

        return updated;
      });

    } catch (e) {
      console.error(e);
      setDumpError('텍스트 분석 중 시스템 에러가 발생했습니다.');
    }
  };

  // 입력값 헬퍼 함수
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue = value === '' ? 0 : Math.max(0, parseFloat(value));
    setFormData((prev) => ({
      ...prev,
      [name]: numValue,
    }));
  };

  const handleCheckboxChange = (key: keyof Marketability) => {
    setFormData((prev) => ({
      ...prev,
      marketability: {
        ...prev.marketability,
        [key]: !prev.marketability[key],
      },
    }));
  };

  // 실시간 계산 로직
  const platformFee = Math.round(formData.sellingPrice * (formData.platformFeePercent / 100));
  const totalCost = formData.supplyPrice + formData.intlShipping + formData.localShipping + platformFee;
  const margin = formData.sellingPrice - totalCost;
  const marginPercent = formData.sellingPrice > 0 ? (margin / formData.sellingPrice) * 100 : 0;

  // 키워드 검출 (상품명 및 메모 전체 대상)
  const textToScan = `${formData.productName} ${formData.memo}`.toLowerCase();
  const foundHighRisk = HIGH_RISK_KEYWORDS.filter((kw) =>
    textToScan.includes(kw.toLowerCase())
  );
  const foundReview = REVIEW_KEYWORDS.filter((kw) =>
    textToScan.includes(kw.toLowerCase())
  );

  // 시장성 체크 개수
  const checkedMarketCount = Object.values(formData.marketability).filter(Boolean).length;

  // 판정 로직
  let decision: DecisionType = 'REVIEW_ONLY';
  const passReasons: string[] = [];
  const failReasons: string[] = [];

  // 1. REJECTED 판정
  const isNameEmpty = formData.productName.trim() === '';
  const hasHighRiskKw = foundHighRisk.length > 0;
  const isNegativeMargin = margin <= 0;
  const isLowMarginPercent = marginPercent < 10;
  const isLowSupplierScore = formData.supplierScore < 70;

  if (isNameEmpty || hasHighRiskKw || isNegativeMargin || isLowMarginPercent || isLowSupplierScore) {
    decision = 'REJECTED';
    if (isNameEmpty) failReasons.push('상품명이 입력되지 않았습니다.');
    if (hasHighRiskKw) failReasons.push(`고위험 키워드 발견: ${foundHighRisk.join(', ')}`);
    if (isNegativeMargin) failReasons.push('예상 마진이 0원 이하입니다.');
    if (isLowMarginPercent) failReasons.push(`마진율이 최소 기준(10%) 미만입니다. 현재: ${marginPercent.toFixed(1)}%`);
    if (isLowSupplierScore) failReasons.push(`공급사 점수가 70점 미만입니다. 현재: ${formData.supplierScore}점`);
  } else {
    // 2. APPROVED_CANDIDATE 판정
    const isApproved =
      foundHighRisk.length === 0 &&
      foundReview.length === 0 &&
      marginPercent >= 30 &&
      formData.optionCount <= 3 &&
      formData.supplierScore >= 90 &&
      checkedMarketCount >= 3;

    // 3. WATCHLIST 판정
    const isWatchlist =
      foundHighRisk.length === 0 &&
      marginPercent >= 20 &&
      formData.supplierScore >= 80 &&
      checkedMarketCount >= 2;

    if (isApproved) {
      decision = 'APPROVED_CANDIDATE';
      passReasons.push('고위험 및 검토 키워드 없음');
      passReasons.push(`우수한 마진율 (${marginPercent.toFixed(1)}% >= 30%)`);
      passReasons.push(`단순한 옵션 구성 (${formData.optionCount}개 <= 3개)`);
      passReasons.push(`공급사 신뢰도 매우 우수 (${formData.supplierScore}점 >= 90점)`);
      passReasons.push(`시장성 입증 지표 충분 (${checkedMarketCount}개 체크)`);
    } else if (isWatchlist) {
      decision = 'WATCHLIST';
      passReasons.push('고위험 키워드 없음');
      passReasons.push(`안정적 마진율 (${marginPercent.toFixed(1)}% >= 20%)`);
      passReasons.push(`공급사 신뢰도 우수 (${formData.supplierScore}점 >= 80점)`);
      passReasons.push(`기본 시장성 만족 (${checkedMarketCount}개 체크)`);
      
      // 주의 요인들 기재
      if (foundReview.length > 0) failReasons.push(`수기 검토 키워드 포함: ${foundReview.join(', ')}`);
      if (formData.optionCount > 3) failReasons.push(`옵션 개수 다소 많음 (${formData.optionCount}개)`);
      if (formData.supplierScore < 90) failReasons.push(`공급사 점수 보완 필요 (${formData.supplierScore}점)`);
      if (checkedMarketCount < 3) failReasons.push(`시장성 지표 검증 강화 권장`);
    } else {
      decision = 'REVIEW_ONLY';
      // 수기 검토 상세 사유 정리
      if (foundReview.length > 0) failReasons.push(`주의/검토 키워드 발견: ${foundReview.join(', ')}`);
      if (formData.optionCount > 5) failReasons.push(`옵션 과다로 인한 반품 리스크 (${formData.optionCount}개)`);
      if (formData.supplierScore < 80) failReasons.push(`공급사 평판 모니터링 필요 (${formData.supplierScore}점)`);
      if (marginPercent < 20) failReasons.push(`마진율 보완 필요 (${marginPercent.toFixed(1)}% < 20%)`);
      if (checkedMarketCount < 2) failReasons.push(`시장성 검증 데이터 보강 필요 (${checkedMarketCount}개 체크됨)`);
      
      if (formData.productName.trim() !== '') passReasons.push('기본 유효성 통과');
      if (marginPercent >= 10) passReasons.push(`최소 마진율 확보 (${marginPercent.toFixed(1)}%)`);
      if (formData.supplierScore >= 70) passReasons.push(`공급사 최소 기준 충족 (${formData.supplierScore}점)`);
    }
  }

  // 위험 점수 연산
  // - 고위험 키워드 수 x 25, 최대 50
  // - 검토 키워드 수 x 10, 최대 30
  // - 옵션 5개 초과 +10, 10개 초과 +20
  // - 공급사 점수 80 미만 +10, 70 미만 +20
  // - 마진율 20% 미만 +10, 15% 미만 +20
  // - 시장성 체크 3개 미만 +10, 1개 미만 +20
  let calculatedRiskScore = 0;
  calculatedRiskScore += Math.min(50, foundHighRisk.length * 25);
  calculatedRiskScore += Math.min(30, foundReview.length * 10);
  
  if (formData.optionCount > 10) {
    calculatedRiskScore += 20;
  } else if (formData.optionCount > 5) {
    calculatedRiskScore += 10;
  }

  if (formData.supplierScore < 70) {
    calculatedRiskScore += 20;
  } else if (formData.supplierScore < 80) {
    calculatedRiskScore += 10;
  }

  if (marginPercent < 15) {
    calculatedRiskScore += 20;
  } else if (marginPercent < 20) {
    calculatedRiskScore += 10;
  }

  if (checkedMarketCount < 1) {
    calculatedRiskScore += 20;
  } else if (checkedMarketCount < 3) {
    calculatedRiskScore += 10;
  }

  const riskScore = Math.min(100, Math.max(0, calculatedRiskScore));

  // 다음 조치 텍스트 매핑
  const NEXT_ACTION_MAP = {
    APPROVED_CANDIDATE: '승인 후보 저장 후 상세페이지 초안 작성',
    WATCHLIST: '가격·리뷰·공급사 변동 2~3일 관찰',
    REVIEW_ONLY: 'KC/통관/파손/옵션 기준 수기 확인',
    REJECTED: '등록 보류 또는 대체 상품 탐색',
  };
  const nextAction = NEXT_ACTION_MAP[decision];

  // 샘플 데이터 로드
  const loadSample = () => {
    setFormData({
      productName: '무선 충전식 LED 작업등 배터리 포함',
      productUrl: 'https://detail.1688.com/offer/712345678.html',
      supplyPrice: 12000,
      sellingPrice: 25000,
      intlShipping: 5000,
      localShipping: 3000,
      platformFeePercent: 10,
      optionCount: 5,
      supplierScore: 85,
      marketability: {
        domesticDemand: true,
        detailImageEnough: true,
        priceGapExists: true,
        reviewVolumeChecked: false,
        optionSimple: false,
        lowDamageRisk: false,
      },
      memo: '테스트용 샘플 데이터: 충전식 배터리가 내장된 LED 조명 기구로, KC 인증 검토 및 전기 안전 확보 여부 체크가 시급함.',
    });
  };

  // 입력값 초기화
  const resetForm = () => {
    setFormData(INITIAL_FORM_DATA);
  };

  // 후보 저장 기능
  const saveCandidate = () => {
    if (formData.productName.trim() === '') {
      alert('상품명을 입력해야 후보 저장이 가능합니다.');
      return;
    }

    const now = new Date();
    // KST 날짜 스트링 포맷팅 (YYYY-MM-DD HH:MM)
    const offset = now.getTimezoneOffset() * 60000;
    const kstDate = new Date(now.getTime() - offset);
    const savedAtStr = kstDate.toISOString().replace('T', ' ').substring(0, 16);

    const newItem: CandidateItem = {
      id: Math.random().toString(36).substring(2, 9),
      savedAt: savedAtStr,
      formData: { ...formData },
      decision,
      margin,
      marginPercent,
      totalCost,
      riskScore,
      nextAction,
    };

    const updated = [newItem, ...candidates].slice(0, 30);
    setCandidates(updated);
    localStorage.setItem('orbit_screening_candidates', JSON.stringify(updated));

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // 저장 기록 전체 비우기
  const clearHistory = () => {
    if (window.confirm('저장된 상품 심사 후보 기록을 모두 삭제하시겠습니까?')) {
      setCandidates([]);
      localStorage.removeItem('orbit_screening_candidates');
    }
  };

  // CSV 다운로드
  const downloadCSV = () => {
    if (candidates.length === 0) {
      alert('저장된 후보 기록이 없습니다. 먼저 후보를 저장해 주세요.');
      return;
    }

    // CSV 헤더 정의
    const headers = [
      '저장일',
      '상품명',
      '판정',
      '마진율(%)',
      '예상마진(원)',
      '총원가(원)',
      '판매가(원)',
      '위험점수',
      '고위험키워드',
      '검토키워드',
      '다음조치',
      'URL',
      '메모'
    ];

    // CSV 행 생성
    const rows = candidates.map((item) => {
      const fd = item.formData;
      
      // 판정 한글 매핑
      const decisionKo = {
        APPROVED_CANDIDATE: '판매 후보',
        WATCHLIST: '관찰 후보',
        REVIEW_ONLY: '수기 검토',
        REJECTED: '탈락',
      }[item.decision];

      const pNameLower = fd.productName.toLowerCase();
      const highKw = HIGH_RISK_KEYWORDS.filter((kw) => pNameLower.includes(kw.toLowerCase())).join(' | ');
      const revKw = REVIEW_KEYWORDS.filter((kw) => pNameLower.includes(kw.toLowerCase())).join(' | ');

      // CSV 필드 안전 래핑 (쌍따옴표 처리 및 이스케이프)
      const escapeField = (val: string | number) => {
        const str = String(val ?? '');
        return `"${str.replace(/"/g, '""')}"`;
      };

      return [
        escapeField(item.savedAt),
        escapeField(fd.productName),
        escapeField(decisionKo),
        escapeField(item.marginPercent.toFixed(1)),
        escapeField(item.margin),
        escapeField(item.totalCost),
        escapeField(fd.sellingPrice),
        escapeField(item.riskScore),
        escapeField(highKw),
        escapeField(revKw),
        escapeField(item.nextAction),
        escapeField(fd.productUrl),
        escapeField(fd.memo),
      ].join(',');
    });

    // UTF-8 BOM 붙여 한글 깨짐 방지
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'purchase-agent-screening.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 판정 등급별 스타일 클래스 반환
  const getDecisionBadgeStyle = (dec: DecisionType) => {
    switch (dec) {
      case 'APPROVED_CANDIDATE':
        return 'border-[#00F2FF] bg-[#00F2FF]/10 text-[#00F2FF] shadow-[0_0_15px_rgba(0,242,255,0.2)]';
      case 'WATCHLIST':
        return 'border-[#FFD700] bg-[#FFD700]/10 text-[#FFD700] shadow-[0_0_15px_rgba(255,215,0,0.15)]';
      case 'REVIEW_ONLY':
        return 'border-[#C084FC] bg-[#C084FC]/10 text-[#C084FC] shadow-[0_0_15px_rgba(192,132,252,0.15)]';
      case 'REJECTED':
        return 'border-[#EF4444] bg-[#EF4444]/10 text-[#F87171] shadow-[0_0_15px_rgba(239,68,68,0.2)]';
      default:
        return 'border-white/20 bg-white/5 text-white/70';
    }
  };

  const getDecisionText = (dec: DecisionType) => {
    switch (dec) {
      case 'APPROVED_CANDIDATE':
        return '판매 후보 (APPROVED)';
      case 'WATCHLIST':
        return '관찰 후보 (WATCHLIST)';
      case 'REVIEW_ONLY':
        return '수기 검토 (REVIEW)';
      case 'REJECTED':
        return '소싱 탈락 (REJECTED)';
      default:
        return '대기 중';
    }
  };

  return (
    <div className="min-h-screen bg-[#030509] text-[#F8FAFC] font-sans selection:bg-[#00F2FF]/30 overflow-x-hidden">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&family=Inter:wght@300;400;700&display=swap');
        
        body {
          background: radial-gradient(circle at 10% 10%, rgba(0, 242, 255, 0.08), transparent 40%),
                      radial-gradient(circle at 90% 90%, rgba(255, 215, 0, 0.08), transparent 40%),
                      linear-gradient(180deg, #030509 0%, #0A0F1E 100%);
          background-attachment: fixed;
          margin: 0;
        }

        .glass-card {
          background: rgba(13, 22, 45, 0.6);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
        }

        .cyber-input {
          background: rgba(3, 5, 9, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #F8FAFC;
          border-radius: 12px;
          padding: 12px 16px;
          transition: all 0.3s ease;
          width: 100%;
        }

        .cyber-input:focus {
          outline: none;
          border-color: #00F2FF;
          box-shadow: 0 0 10px rgba(0, 242, 255, 0.25);
        }

        .cyber-checkbox {
          appearance: none;
          width: 20px;
          height: 20px;
          border: 1.5px solid rgba(255, 255, 255, 0.3);
          border-radius: 6px;
          background-color: transparent;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cyber-checkbox:checked {
          background-color: #00F2FF;
          border-color: #00F2FF;
          box-shadow: 0 0 8px rgba(0, 242, 255, 0.4);
        }

        .cyber-checkbox:checked::after {
          content: '✓';
          color: #000;
          font-size: 13px;
          font-weight: 900;
        }

        .btn-gold {
          background: linear-gradient(135deg, #FFD700, #FFB800);
          color: #000 !important;
          box-shadow: 0 0 24px rgba(255, 215, 0, 0.3);
          font-weight: 800;
        }

        .btn-gold:hover:not(:disabled) {
          box-shadow: 0 0 40px rgba(255, 215, 0, 0.5);
          transform: translateY(-2px);
        }

        .btn-cyber {
          background: linear-gradient(135deg, #00F2FF, #00A3FF);
          color: #000 !important;
          box-shadow: 0 0 24px rgba(0, 242, 255, 0.3);
          font-weight: 800;
        }

        .btn-cyber:hover:not(:disabled) {
          box-shadow: 0 0 40px rgba(0, 242, 255, 0.5);
          transform: translateY(-2px);
        }

        .nav-link {
          font-size: 13px;
          font-weight: 800;
          color: #94A3B8;
          transition: all 0.4s ease;
          letter-spacing: 1.2px;
        }

        .nav-link:hover {
          color: #00F2FF;
        }
      `}</style>

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-[100] backdrop-blur-xl bg-[#030509]/50 border-b border-white/5">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10 flex items-center justify-between h-[70px] lg:h-[100px]">
          <div className="flex items-center gap-4 lg:gap-6">
            <Link href="/" className="font-outfit font-black text-[22px] lg:text-[28px] tracking-tight flex items-center cursor-pointer">
              <span className="text-[#FFD700]">ORBIT</span>
              <span className="text-white/20 mx-2.5">/</span>
              <span className="text-[#00F2FF]">ALPHA</span>
            </Link>
          </div>

          <nav className="hidden lg:flex items-center gap-14">
            <Link href="/" className="nav-link">HOME</Link>
            <Link href="/tools" className="nav-link">TOOLS HUB</Link>
            <span className="text-[#00F2FF] text-[13px] font-black tracking-widest font-outfit uppercase">PURCHASE SCREENER</span>
          </nav>

          <div className="flex items-center gap-2 lg:gap-5">
            <Link href="/tools" className="px-4 lg:px-8 py-2.5 lg:py-3.5 rounded-xl border border-white/15 bg-white/5 text-white/80 text-[11px] lg:text-[13px] font-bold tracking-wide hover:bg-white/10 transition-all cursor-pointer">
              도구 허브로 돌아가기
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-[100px] lg:pt-[150px] pb-24">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
          
          {/* Breadcrumb & Title */}
          <div className="mb-10 lg:mb-12">
            <div className="inline-flex items-center gap-2 text-[12px] font-black tracking-[0.25em] uppercase text-[#00F2FF] mb-4">
              <Link href="/tools">Tools Hub</Link>
              <span className="text-white/20">/</span>
              <span className="text-white/60">Purchase Agent Screening MVP</span>
            </div>
            <h1 className="text-[32px] lg:text-[44px] font-black font-outfit mb-3 text-white">
              구매대행 상품 심사기
            </h1>
            <p className="max-w-[760px] text-[15px] lg:text-[16px] leading-7 text-[#94A3B8] font-medium">
              상품의 소싱 원가, 배송비 및 옵션을 입력하여 실시간 마진율을 확인하고, 유통 위해 요인 및 위험 키워드를 즉시 감지하여 안전 등급을 필터링합니다.
            </p>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex flex-wrap gap-3 mb-8 justify-between items-center bg-black/30 p-4 rounded-2xl border border-white/5">
            <div className="flex flex-wrap gap-2.5">
              <button 
                onClick={loadSample}
                className="px-4 py-2.5 text-[12px] font-black bg-[#122240] hover:bg-[#1b3461] text-[#00F2FF] border border-[#00F2FF]/20 rounded-xl transition-all"
              >
                💡 테스트 샘플 로드 (충전식 작업등)
              </button>
              <button 
                onClick={resetForm}
                className="px-4 py-2.5 text-[12px] font-bold bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded-xl transition-all"
              >
                ↺ 입력 초기화
              </button>
            </div>
            {mounted && (
              <div className="flex flex-wrap gap-2.5">
                <button 
                  onClick={downloadCSV}
                  disabled={candidates.length === 0}
                  className="px-4 py-2.5 text-[12px] font-bold bg-[#1e1c0d] hover:bg-[#2c2810] text-[#FFD700] border border-[#FFD700]/20 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  📥 CSV 내보내기 (.csv)
                </button>
                <button 
                  onClick={clearHistory}
                  disabled={candidates.length === 0}
                  className="px-4 py-2.5 text-[12px] font-bold bg-red-950/30 hover:bg-red-950/60 text-red-400 border border-red-900/30 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  🗑️ 저장소 비우기
                </button>
              </div>
            )}
          </div>

          {/* Sourcing Text Dump Parser Panel */}
          <div className="glass-card p-6 lg:p-8 border-[#00F2FF]/20 bg-[linear-gradient(135deg,rgba(13,22,45,0.4),rgba(3,5,9,0.4))] mb-8 space-y-4 shadow-xl">
            <h2 className="text-[18px] font-black font-outfit text-white flex items-center gap-2">
              📋 1688 소싱 텍스트 분석기
              <span className="text-[11px] font-black px-2 py-0.5 rounded bg-[#00F2FF]/10 text-[#00F2FF] border border-[#00F2FF]/20">2차 수동 덤프 파서</span>
            </h2>
            <p className="text-[12px] text-[#94A3B8] font-medium leading-5">
              1688 상품 상세페이지에서 전체 복사(<kbd className="px-1.5 py-0.5 bg-black/40 rounded border border-white/10">Ctrl+A</kbd> &rarr; <kbd className="px-1.5 py-0.5 bg-black/40 rounded border border-white/10">Ctrl+C</kbd>)한 전체 텍스트를 붙여넣으세요. 상품명, 위안화 가격 후보, 옵션 수, 위험/검토 키워드를 즉시 추출하여 기존 심사 폼에 자동 반영해 줍니다.
            </p>
            <div className="space-y-3">
              <label className="block text-[13px] font-black tracking-wide text-white/80 uppercase">
                소싱 텍스트 붙여넣기
              </label>
              <textarea
                value={rawDumpText}
                onChange={(e) => setRawDumpText(e.target.value)}
                placeholder="여기에 1688 상세페이지 전체 복사 텍스트를 붙여넣으세요..."
                rows={4}
                className="cyber-input text-[12px]"
              />
              {dumpError && (
                <div className="text-[12px] text-red-400 font-bold">
                  ⚠️ {dumpError}
                </div>
              )}
              <div className="flex justify-between items-center gap-4">
                <button
                  type="button"
                  onClick={handleDumpAnalysis}
                  className="px-6 py-3 rounded-xl btn-gold text-[13px] font-bold"
                >
                  ⚡ 텍스트 분석
                </button>
                {parseResult && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawDumpText('');
                      setParseResult(null);
                      setDumpError('');
                    }}
                    className="text-[12px] text-white/50 hover:text-white"
                  >
                    결과 지우기
                  </button>
                )}
              </div>
            </div>

            {/* Parsing Result Visual Feedback */}
            {parseResult && (
              <div className="mt-4 p-5 rounded-2xl bg-black/40 border border-white/5 grid md:grid-cols-2 gap-5 text-[13px] transition-all duration-300">
                <div className="space-y-2">
                  <h4 className="text-[12px] text-[#00F2FF] font-black uppercase tracking-wider">🔍 추출 데이터 후보</h4>
                  <div className="space-y-1">
                    <div className="text-white/60">
                      <span className="font-bold">상품명 후보:</span> <span className="text-white">{parseResult.titleCandidate}</span>
                    </div>
                    <div className="text-white/60">
                      <span className="font-bold">위안화 최저가:</span>{' '}
                      <span className="text-[#FFD700] font-bold">
                        {parseResult.priceMin !== null ? `¥ ${parseResult.priceMin.toLocaleString()}` : '감지 실패'}
                      </span>
                    </div>
                    <div className="text-white/60">
                      <span className="font-bold">위안화 최고가:</span>{' '}
                      <span className="text-[#FFD700] font-bold">
                        {parseResult.priceMax !== null ? `¥ ${parseResult.priceMax.toLocaleString()}` : '감지 실패'}
                      </span>
                    </div>
                    <div className="text-white/60">
                      <span className="font-bold">추정 옵션 수:</span>{' '}
                      <span className="text-white">
                        {parseResult.optionCountEstimated}개{' '}
                        {parseResult.optionStatus === 'DETECTED' ? (
                          <span className="text-[10px] text-[#00F2FF] font-bold">(자동 감지)</span>
                        ) : (
                          <span className="text-[10px] text-[#C084FC] font-bold">(수기 확인 필요)</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[12px] text-[#00F2FF] font-black uppercase tracking-wider">⚠️ 원문 내 키워드 스캔 결과</h4>
                  <div className="space-y-1.5">
                    <div>
                      <span className="font-bold text-red-400 block text-[11px] mb-0.5">고위험 키워드:</span>
                      {parseResult.foundHighRiskKeywords.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {parseResult.foundHighRiskKeywords.map(kw => (
                            <span key={kw} className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-900/30 text-[11px] font-bold">{kw}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-white/40 text-[12px]">없음</span>
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-[#FFD700] block text-[11px] mb-0.5">주의/검토 키워드:</span>
                      {parseResult.foundReviewKeywords.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {parseResult.foundReviewKeywords.map(kw => (
                            <span key={kw} className="px-2 py-0.5 rounded bg-yellow-950 text-[#FFD700] border border-yellow-900/30 text-[11px] font-bold">{kw}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-white/40 text-[12px]">없음</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 border-t border-white/5 pt-3 flex justify-between items-center">
                  <span className="text-[11px] text-[#94A3B8]">
                    * 추출된 값들이 기존 입력 폼에 즉시 세팅되었습니다. 공급가(위안화)는 수동 환율 적용 확인 후 원화로 보완하여 주십시오.
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border ${parseResult.priceMin === null || parseResult.optionStatus === 'MANUAL_REQUIRED' ? 'border-[#C084FC] bg-[#C084FC]/10 text-[#C084FC]' : 'border-[#00F2FF] bg-[#00F2FF]/10 text-[#00F2FF]'}`}>
                    {parseResult.priceMin === null || parseResult.optionStatus === 'MANUAL_REQUIRED' ? '⚠️ 수기 확인 필요' : '✓ 폼에 반영됨'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Main Grid: Left inputs, Right results */}
          <div className="grid lg:grid-cols-12 gap-8 items-start mb-12">
            
            {/* Input Form Column (7) */}
            <div className="lg:col-span-7 glass-card p-6 lg:p-8 space-y-6">
              <h2 className="text-[20px] font-black font-outfit text-white border-b border-white/10 pb-3 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-[#00F2FF] inline-block rounded"></span> 상품 정보 및 수치 입력
              </h2>

              {/* Basic Details */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-[13px] font-black tracking-wide text-white/80 mb-2 uppercase">
                    상품명 / 핵심 키워드 <span className="text-[#00F2FF]">*</span>
                  </label>
                  <input
                    type="text"
                    name="productName"
                    value={formData.productName}
                    onChange={handleInputChange}
                    placeholder="예: 다기능 무선 충전 전동 드릴"
                    className="cyber-input"
                  />
                  <p className="mt-1 text-[11px] text-[#94A3B8] font-medium">
                    * 고위험 및 검토 키워드를 실시간으로 판별합니다.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[13px] font-black tracking-wide text-white/80 mb-2 uppercase">
                    상품 소싱 URL
                  </label>
                  <input
                    type="text"
                    name="productUrl"
                    value={formData.productUrl}
                    onChange={handleInputChange}
                    placeholder="https://detail.1688.com/offer/..."
                    className="cyber-input"
                  />
                </div>
              </div>

              {/* Price Details */}
              <div className="grid md:grid-cols-3 gap-4 border-t border-white/5 pt-4">
                <div>
                  <label className="block text-[13px] font-black tracking-wide text-white/80 mb-2 uppercase">
                    공급사 단가 (공급가)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-white/40 text-[14px]">₩</span>
                    <input
                      type="number"
                      name="supplyPrice"
                      value={formData.supplyPrice || ''}
                      onChange={handleNumberChange}
                      placeholder="0"
                      className="cyber-input pl-8"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-black tracking-wide text-white/80 mb-2 uppercase">
                    예상 판매가 (플랫폼)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-white/40 text-[14px]">₩</span>
                    <input
                      type="number"
                      name="sellingPrice"
                      value={formData.sellingPrice || ''}
                      onChange={handleNumberChange}
                      placeholder="0"
                      className="cyber-input pl-8"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-black tracking-wide text-white/80 mb-2 uppercase">
                    플랫폼 수수료율 (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      name="platformFeePercent"
                      value={formData.platformFeePercent || ''}
                      onChange={handleNumberChange}
                      placeholder="10"
                      className="cyber-input pr-8"
                    />
                    <span className="absolute right-3.5 top-3 text-white/40 text-[14px]">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-black tracking-wide text-white/80 mb-2 uppercase">
                    해외 배송비
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-white/40 text-[14px]">₩</span>
                    <input
                      type="number"
                      name="intlShipping"
                      value={formData.intlShipping || ''}
                      onChange={handleNumberChange}
                      placeholder="0"
                      className="cyber-input pl-8"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-black tracking-wide text-white/80 mb-2 uppercase">
                    국내 배송비
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-white/40 text-[14px]">₩</span>
                    <input
                      type="number"
                      name="localShipping"
                      value={formData.localShipping || ''}
                      onChange={handleNumberChange}
                      placeholder="0"
                      className="cyber-input pl-8"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-black tracking-wide text-white/80 mb-2 uppercase">
                    등록 옵션 개수
                  </label>
                  <input
                    type="number"
                    name="optionCount"
                    value={formData.optionCount || ''}
                    onChange={handleNumberChange}
                    placeholder="1"
                    className="cyber-input"
                  />
                </div>
              </div>

              {/* Supplier Score */}
              <div className="border-t border-white/5 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[13px] font-black tracking-wide text-white/80 uppercase">
                    공급사 평점 / 신뢰도 점수 (0 ~ 100)
                  </label>
                  <span className="text-[14px] font-black text-[#FFD700] font-outfit">{formData.supplierScore}점</span>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    name="supplierScore"
                    min="0"
                    max="100"
                    value={formData.supplierScore}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplierScore: parseInt(e.target.value) }))}
                    className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-[#00F2FF]"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[#94A3B8] font-medium">
                  * 70점 미만은 소싱 탈락 사유에 해당합니다. (기본 권장: 80점 이상)
                </p>
              </div>

              {/* Marketability Checklist */}
              <div className="border-t border-white/5 pt-4">
                <label className="block text-[13px] font-black tracking-wide text-white/80 mb-3 uppercase">
                  시장성 & 리스크 체크리스트
                </label>
                <div className="grid md:grid-cols-2 gap-3.5">
                  <label className="flex items-center gap-3 bg-black/20 p-3 rounded-xl border border-white/5 cursor-pointer hover:border-[#00F2FF]/30 transition-all">
                    <input
                      type="checkbox"
                      checked={formData.marketability.domesticDemand}
                      onChange={() => handleCheckboxChange('domesticDemand')}
                      className="cyber-checkbox"
                    />
                    <span className="text-[13px] text-white/80 font-medium">국내 시장 수요 확인됨</span>
                  </label>

                  <label className="flex items-center gap-3 bg-black/20 p-3 rounded-xl border border-white/5 cursor-pointer hover:border-[#00F2FF]/30 transition-all">
                    <input
                      type="checkbox"
                      checked={formData.marketability.detailImageEnough}
                      onChange={() => handleCheckboxChange('detailImageEnough')}
                      className="cyber-checkbox"
                    />
                    <span className="text-[13px] text-white/80 font-medium">상세페이지 이미지 충분</span>
                  </label>

                  <label className="flex items-center gap-3 bg-black/20 p-3 rounded-xl border border-white/5 cursor-pointer hover:border-[#00F2FF]/30 transition-all">
                    <input
                      type="checkbox"
                      checked={formData.marketability.priceGapExists}
                      onChange={() => handleCheckboxChange('priceGapExists')}
                      className="cyber-checkbox"
                    />
                    <span className="text-[13px] text-white/80 font-medium">최저가 대비 마진 확보됨</span>
                  </label>

                  <label className="flex items-center gap-3 bg-black/20 p-3 rounded-xl border border-white/5 cursor-pointer hover:border-[#00F2FF]/30 transition-all">
                    <input
                      type="checkbox"
                      checked={formData.marketability.reviewVolumeChecked}
                      onChange={() => handleCheckboxChange('reviewVolumeChecked')}
                      className="cyber-checkbox"
                    />
                    <span className="text-[13px] text-white/80 font-medium">현지 누적 판매량/리뷰 우수</span>
                  </label>

                  <label className="flex items-center gap-3 bg-black/20 p-3 rounded-xl border border-white/5 cursor-pointer hover:border-[#00F2FF]/30 transition-all">
                    <input
                      type="checkbox"
                      checked={formData.marketability.optionSimple}
                      onChange={() => handleCheckboxChange('optionSimple')}
                      className="cyber-checkbox"
                    />
                    <span className="text-[13px] text-white/80 font-medium">단순 옵션 (통관·반품 리스크 낮음)</span>
                  </label>

                  <label className="flex items-center gap-3 bg-black/20 p-3 rounded-xl border border-white/5 cursor-pointer hover:border-[#00F2FF]/30 transition-all">
                    <input
                      type="checkbox"
                      checked={formData.marketability.lowDamageRisk}
                      onChange={() => handleCheckboxChange('lowDamageRisk')}
                      className="cyber-checkbox"
                    />
                    <span className="text-[13px] text-white/80 font-medium">파손 우려 낮음 (포장 안정적)</span>
                  </label>
                </div>
              </div>

              {/* Memo */}
              <div className="border-t border-white/5 pt-4">
                <label className="block text-[13px] font-black tracking-wide text-white/80 mb-2 uppercase">
                  메모 / 상세 설명
                </label>
                <textarea
                  name="memo"
                  value={formData.memo}
                  onChange={handleInputChange}
                  rows={3}
                  placeholder="의구심이 들거나 유통 통관에 필요한 정보, 추가 조사사항을 적어두세요."
                  className="cyber-input"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={saveCandidate}
                  className="w-full py-4 rounded-xl btn-cyber text-[15px] font-black flex items-center justify-center gap-2"
                >
                  📂 {saveSuccess ? '후보 기록 저장 완료!' : '현재 판정 결과 후보로 저장'}
                </button>
              </div>

            </div>

            {/* Results Column (5) */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Screening Result Panel */}
              <div className="glass-card p-6 lg:p-8 border-[#00F2FF]/15 bg-[radial-gradient(circle_at_top_right,rgba(0,242,255,0.05),transparent_36%),linear-gradient(135deg,rgba(18,28,55,0.8),rgba(8,13,28,0.8))] shadow-2xl relative overflow-hidden">
                
                {/* Decision Badge */}
                <div className="text-center mb-6">
                  <div className="text-[11px] font-black text-white/40 tracking-[0.25em] uppercase mb-2">1차 자동 심사 판정</div>
                  <div className={`inline-block border px-6 py-2.5 rounded-full text-[16px] font-black tracking-wider ${getDecisionBadgeStyle(decision)}`}>
                    {getDecisionText(decision)}
                  </div>
                </div>

                {/* Score & Margin Dashboard */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-black/45 p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
                    <span className="text-[10px] text-white/50 block mb-1 font-black uppercase">예상 마진율</span>
                    <strong className={`text-2xl font-black font-outfit ${marginPercent >= 20 ? 'text-[#00F2FF]' : marginPercent >= 10 ? 'text-[#FFD700]' : 'text-red-400'}`}>
                      {marginPercent.toFixed(1)}%
                    </strong>
                  </div>
                  <div className="bg-black/45 p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
                    <span className="text-[10px] text-white/50 block mb-1 font-black uppercase">예상 마진액</span>
                    <strong className={`text-xl font-black font-outfit ${margin > 0 ? 'text-[#FFD700]' : 'text-red-400'}`}>
                      ₩ {margin.toLocaleString()}
                    </strong>
                  </div>
                </div>

                {/* Risk Score Gauge */}
                <div className="bg-black/45 p-5 rounded-2xl border border-white/5 mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[11px] text-white/50 font-black uppercase">위험 점수 (Risk Score)</span>
                    <span className={`text-[15px] font-black font-outfit ${riskScore >= 60 ? 'text-red-400' : riskScore >= 30 ? 'text-[#FFD700]' : 'text-[#00F2FF]'}`}>
                      {riskScore} / 100
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 rounded-full ${riskScore >= 60 ? 'bg-gradient-to-r from-orange-500 to-red-500' : riskScore >= 30 ? 'bg-gradient-to-r from-yellow-500 to-[#FFD700]' : 'bg-gradient-to-r from-[#00F2FF] to-blue-500'}`}
                      style={{ width: `${riskScore}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[9px] text-white/30 mt-1 font-bold">
                    <span>안전 (0)</span>
                    <span>경계 (40)</span>
                    <span>위험 (100)</span>
                  </div>
                </div>

                {/* Costs Detail List */}
                <div className="border-t border-white/10 pt-4 mb-6 space-y-2 text-[13px]">
                  <div className="flex justify-between text-white/60">
                    <span>상품 공급가</span>
                    <span className="font-outfit font-semibold">₩ {formData.supplyPrice.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-white/60">
                    <span>해외 배송비</span>
                    <span className="font-outfit font-semibold">₩ {formData.intlShipping.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-white/60">
                    <span>국내 배송비</span>
                    <span className="font-outfit font-semibold">₩ {formData.localShipping.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-white/60">
                    <span>플랫폼 수수료 ({formData.platformFeePercent}%)</span>
                    <span className="font-outfit font-semibold">₩ {platformFee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-white/80 font-black border-t border-white/5 pt-2 mt-2">
                    <span>총합 원가</span>
                    <span className="font-outfit text-[#FFD700]">₩ {totalCost.toLocaleString()}</span>
                  </div>
                </div>

                {/* Next Steps Guide */}
                <div className="bg-[#121C37] border border-[#00F2FF]/20 p-4 rounded-xl">
                  <span className="text-[10px] text-[#00F2FF] font-black block mb-1 uppercase tracking-wider">👉 다음 권장 조치</span>
                  <p className="text-[14px] text-white font-black leading-relaxed">
                    {nextAction}
                  </p>
                </div>
              </div>

              {/* Reasons & Feedback */}
              <div className="glass-card p-6 bg-black/45 space-y-5">
                <h3 className="text-[16px] font-black font-outfit text-white flex items-center gap-2">
                  📋 상세 사유 피드백
                </h3>
                
                {/* Positives */}
                {passReasons.length > 0 && (
                  <div>
                    <div className="text-[11px] text-[#00F2FF] font-black mb-2 tracking-wide uppercase">🟢 통과 및 강점 요인</div>
                    <ul className="space-y-1.5">
                      {passReasons.map((reason, idx) => (
                        <li key={idx} className="text-[12px] text-white/80 flex items-start gap-1.5">
                          <span className="text-[#00F2FF] mt-0.5">•</span>
                          <span className="leading-5">{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Negatives / Warnings */}
                {failReasons.length > 0 && (
                  <div className="border-t border-white/5 pt-3.5">
                    <div className="text-[11px] text-red-400 font-black mb-2 tracking-wide uppercase">🔴 감점 및 주의 요인</div>
                    <ul className="space-y-1.5">
                      {failReasons.map((reason, idx) => (
                        <li key={idx} className="text-[12px] text-white/80 flex items-start gap-1.5">
                          <span className="text-red-400 mt-0.5">•</span>
                          <span className="leading-5">{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {passReasons.length === 0 && failReasons.length === 0 && (
                  <p className="text-[12px] text-white/40 text-center py-2">
                    상품명을 입력하여 위해 요소 검토를 시작하세요.
                  </p>
                )}
              </div>

            </div>
          </div>

          {/* History / Candidates List */}
          {mounted && (
            <div className="glass-card p-6 lg:p-8">
              <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
                <h2 className="text-[20px] font-black font-outfit text-white flex items-center gap-2">
                  🗳️ 최근 저장된 심사 후보 리스트
                  <span className="text-[12px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 font-normal">
                    {candidates.length} / 30
                  </span>
                </h2>
                {candidates.length > 0 && (
                  <button 
                    onClick={downloadCSV}
                    className="text-[12px] font-black text-[#FFD700] hover:underline"
                  >
                    📥 전체 CSV 파일 다운로드
                  </button>
                )}
              </div>

              {candidates.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-black/10">
                  <span className="text-[28px] block mb-3">📭</span>
                  <h4 className="text-[15px] font-bold text-white/70 mb-1">저장된 심사 후보가 없습니다.</h4>
                  <p className="text-[12px] text-white/40">
                    상단 폼에 수치를 입력한 뒤 &quot;결과 후보로 저장&quot; 버튼을 눌러보세요.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px] border-collapse min-w-[900px]">
                    <thead>
                      <tr className="border-b border-white/10 text-white/50 text-[11px] font-black uppercase tracking-wider">
                        <th className="pb-3 pr-2">저장일</th>
                        <th className="pb-3 pr-4">상품명</th>
                        <th className="pb-3 pr-4 text-center">판정</th>
                        <th className="pb-3 pr-4 text-right">마진율</th>
                        <th className="pb-3 pr-4 text-right">예상 마진</th>
                        <th className="pb-3 pr-4 text-right">판매가</th>
                        <th className="pb-3 pr-4 text-center">위험점수</th>
                        <th className="pb-3">다음 조치</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {candidates.map((item) => (
                        <tr key={item.id} className="hover:bg-white/5 transition-all">
                          <td className="py-3 text-white/60 pr-2 font-outfit whitespace-nowrap">{item.savedAt}</td>
                          <td className="py-3 pr-4 font-semibold max-w-[220px] truncate" title={item.formData.productName}>
                            {item.formData.productUrl ? (
                              <a 
                                href={item.formData.productUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="hover:text-[#00F2FF] underline decoration-white/15"
                              >
                                {item.formData.productName}
                              </a>
                            ) : (
                              item.formData.productName
                            )}
                          </td>
                          <td className="py-3 pr-4 text-center whitespace-nowrap">
                            <span className={`inline-block text-[10px] font-black px-2.5 py-0.5 rounded-full border ${getDecisionBadgeStyle(item.decision)}`}>
                              {{
                                APPROVED_CANDIDATE: '판매 후보',
                                WATCHLIST: '관찰 후보',
                                REVIEW_ONLY: '수기 검토',
                                REJECTED: '소싱 탈락',
                              }[item.decision]}
                            </span>
                          </td>
                          <td className={`py-3 pr-4 text-right font-bold font-outfit whitespace-nowrap ${item.marginPercent >= 20 ? 'text-[#00F2FF]' : item.marginPercent >= 10 ? 'text-[#FFD700]' : 'text-red-400'}`}>
                            {item.marginPercent.toFixed(1)}%
                          </td>
                          <td className="py-3 pr-4 text-right font-semibold font-outfit whitespace-nowrap">
                            ₩ {item.margin.toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 text-right font-medium font-outfit whitespace-nowrap">
                            ₩ {item.formData.sellingPrice.toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 text-center whitespace-nowrap">
                            <span className={`font-black font-outfit px-2 py-0.5 rounded text-[11px] ${item.riskScore >= 60 ? 'bg-red-950 text-red-400 border border-red-900/30' : item.riskScore >= 30 ? 'bg-yellow-950 text-[#FFD700] border border-yellow-900/30' : 'bg-blue-950 text-[#00F2FF] border border-blue-900/30'}`}>
                              {item.riskScore}
                            </span>
                          </td>
                          <td className="py-3 text-white/80 font-medium truncate max-w-[200px]" title={item.nextAction}>
                            {item.nextAction}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
