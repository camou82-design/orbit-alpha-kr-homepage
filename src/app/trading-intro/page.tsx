import React from "react";
import Link from "next/link";

export default function TradingIntroPage() {
  return (
    <main className="min-h-screen py-16 px-6">
      <div className="max-w-[1024px] mx-auto">
        <div className="mb-10">
          <Link href="/" className="inline-flex items-center gap-2 text-[12px] font-black tracking-[0.2em] uppercase text-[#00F2FF]">
            <span>OrbitAlpha</span>
            <span className="text-white/20">/</span>
            <span>Home</span>
          </Link>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 lg:p-10 backdrop-blur-3xl shadow-2xl">
          <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.28em] uppercase mb-5">
            Trading Service
          </div>
          <h1 className="text-[28px] lg:text-[38px] font-black font-outfit text-white mb-3">
            Orbitalpha Trading · 운영 소개
          </h1>
          <p className="text-[#94A3B8] leading-7 mb-8">
            실시간 시세 모니터링과 전략 기반 운용을 위한 관리시스템입니다. 아래 동선은 로컬에서 UI만 확인할 수 있게 구성되어 있습니다.
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-[#BDF8FF] text-[12px] font-black uppercase tracking-[0.18em] mb-3">
                실시간 시장 모니터링
              </div>
              <p className="text-[#CBD5E1] leading-relaxed text-[14px]">
                시장 흐름과 데이터 업데이트를 기반으로 운영 상태를 빠르게 확인합니다.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-[#BDF8FF] text-[12px] font-black uppercase tracking-[0.18em] mb-3">
                전략 기반 운용
              </div>
              <p className="text-[#CBD5E1] leading-relaxed text-[14px]">
                미리 정의한 전략 로직을 바탕으로 운용 흐름을 정리합니다.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-[#BDF8FF] text-[12px] font-black uppercase tracking-[0.18em] mb-3">
                운영 데이터 추적
              </div>
              <p className="text-[#CBD5E1] leading-relaxed text-[14px]">
                운영 기록과 결과를 추후 점검할 수 있게 관리합니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

