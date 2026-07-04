"use client";

import Link from 'next/link';

export default function ToolsPage() {
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
          padding: 32px;
          transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
        }

        .glass-card:hover:not(.disabled-card) {
          background: rgba(18, 28, 55, 0.8);
          border-color: rgba(0, 242, 255, 0.3);
          transform: translateY(-8px);
        }

        .btn-gold {
          background: linear-gradient(135deg, #FFD700, #FFB800);
          color: #000 !important;
          box-shadow: 0 0 24px rgba(255, 215, 0, 0.3);
          font-weight: 700;
        }

        .btn-gold:hover {
          box-shadow: 0 0 40px rgba(255, 215, 0, 0.5);
          transform: translateY(-3px);
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

        .purse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #00F2FF;
          box-shadow: 0 0 10px #00F2FF;
          animation: blink 2s infinite;
          display: inline-block;
        }

        @keyframes blink {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.1); }
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
            <Link href="/tools" className="nav-link text-[#00F2FF]">TOOLS HUB</Link>
          </nav>

          <div className="flex items-center gap-2 lg:gap-5">
            <Link href="/" className="px-4 lg:px-8 py-2.5 lg:py-3.5 rounded-xl border border-[#00F2FF]/35 bg-[#0b1526] text-[#00F2FF] text-[11px] lg:text-[13px] font-black tracking-wide hover:bg-[#12203a] transition-all cursor-pointer">
              메인으로 이동
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-[110px] lg:pt-[160px] pb-24">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
          {/* Hero Header */}
          <div className="mb-12 lg:mb-16">
            <div className="inline-flex items-center gap-2 text-[12px] font-black tracking-[0.2em] uppercase text-[#00F2FF] mb-5">
              <span>OrbitAlpha</span>
              <span className="text-white/20">/</span>
              <span>Tools Hub</span>
            </div>
            <h1 className="text-[32px] lg:text-[48px] font-black font-outfit mb-4 text-white">
              운영 자동화 도구 허브
            </h1>
            <p className="max-w-[760px] text-[16px] lg:text-[18px] leading-8 text-[#94A3B8] font-medium">
              리스크 관리와 실무 효율 극대화를 위한 OrbitAlpha의 전문 운영 도구들을 제공합니다.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {/* Card 1: 구매대행 상품 심사기 */}
            <div className="glass-card flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center gap-2 text-[#00F2FF] text-[12px] font-black tracking-[0.2em] uppercase mb-4 font-outfit">
                  <span className="purse-dot" /> ACTIVE TOOL
                </div>
                <h2 className="text-[24px] lg:text-[28px] font-black font-outfit mb-4 text-white">
                  구매대행 상품 심사기
                </h2>
                <p className="text-[#94A3B8] leading-7 text-[15px] lg:text-[16px] mb-8 font-medium">
                  상품명, 원가, 판매가, 배송비, 옵션 수, 공급사 점수를 활용하여 상품의 판매 후보, 관찰 후보, 수기 검토, 탈락 여부를 사전에 판정하고 수익률을 연산합니다.
                </p>
                <div className="flex flex-wrap gap-2 mb-8">
                  {['마진 계산', '위험 키워드 차단', '후보 저장', 'CSV 내보내기'].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[#00F2FF]/20 bg-[#0d1729]/75 text-[#BDF8FF] px-3.5 py-1.5 text-[11px] font-black tracking-[0.06em]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <Link
                  href="/tools/purchase-agent"
                  className="inline-block w-full text-center py-4 rounded-xl btn-gold text-[14px] font-bold transition-all"
                >
                  심사 도구 실행하기 &rarr;
                </Link>
              </div>
            </div>

            {/* Card 2: 현장 공구·자재 전문관 */}
            <div className="glass-card disabled-card opacity-60 flex flex-col justify-between h-full border-white/5 bg-black/20">
              <div>
                <div className="text-white/40 text-[12px] font-black tracking-[0.2em] uppercase mb-4 font-outfit">
                  COMING SOON
                </div>
                <h2 className="text-[24px] lg:text-[28px] font-black font-outfit mb-4 text-white/50">
                  현장 공구·자재 전문관
                </h2>
                <p className="text-white/40 leading-7 text-[15px] lg:text-[16px] mb-8 font-medium">
                  오늘 필요한 현장 상황부터 업종 카테고리, 추천 기준 품목까지 공정 자재 조달 효율을 위한 맞춤형 조달 시스템을 준비 중입니다.
                </p>
                <div className="flex flex-wrap gap-2 mb-8">
                  {['현장 맞춤 자재', '공구 추천', '견적서 출력'].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 bg-white/5 text-white/30 px-3.5 py-1.5 text-[11px] font-black tracking-[0.06em]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <button
                  disabled
                  className="w-full text-center py-4 rounded-xl bg-white/5 border border-white/10 text-white/30 text-[14px] font-bold cursor-not-allowed"
                >
                  점검 및 준비 중
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Guidelines Banner */}
          <div className="glass-card border-[#00F2FF]/20 bg-[radial-gradient(circle_at_top_right,rgba(0,242,255,0.05),transparent_36%),linear-gradient(135deg,rgba(18,28,55,0.4),rgba(8,13,28,0.4))] shadow-[0_0_50px_rgba(0,242,255,0.03)]">
            <div className="flex items-center gap-3.5 text-[#FFD700] text-[12px] font-black tracking-[0.25em] uppercase mb-4 font-outfit">
              ⚠️ Operational Standards
            </div>
            <h3 className="text-[20px] lg:text-[22px] font-extrabold font-outfit mb-3 text-white">
              운영 기준
            </h3>
            <p className="text-[#94A3B8] leading-7 text-[15px] lg:text-[16px] font-medium break-keep">
              자동등록보다 먼저 위험 상품을 걸러냅니다. KC 인증 요건, 전기·배터리, 식품 접촉 물질, 의료·화장품 규제, 브랜드/상표권 도용 소지, 파손·옵션 과다·반품 리스크가 존재하는 상품은 바로 등록하지 않고 1차 검사기를 통해 검토 또는 탈락 처리하여 무반품 소싱 엔진의 안정성을 확보합니다.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

