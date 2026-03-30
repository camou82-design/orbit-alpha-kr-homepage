import React from "react";
import Link from "next/link";

export default function TradingLoginPage() {
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
            Trading Console
          </div>
          <h1 className="text-[28px] lg:text-[38px] font-black font-outfit text-white mb-3">
            Orbitalpha Trading · 관리시스템 로그인
          </h1>
          <p className="text-[#94A3B8] leading-7 mb-8">
            지금은 로컬에서 카드 동선과 UI만 확인하기 위한 placeholder 화면입니다. 실제 인증 원천은 기존 <span className="text-[#BDF8FF] font-bold">trade.orbitalpha.kr</span> 구조로 연결 예정입니다.
          </p>

          <div className="grid gap-4">
            <label className="block">
              <span className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">로그인 ID</span>
              <input
                type="text"
                placeholder="예: admin"
                disabled
                className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 outline-none text-white/60"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">비밀번호</span>
              <input
                type="password"
                placeholder="로컬 확인용 (입력 없음)"
                disabled
                className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 outline-none text-white/60"
              />
            </label>

            <button
              type="button"
              disabled
              className="w-full py-5 rounded-2xl btn-gold text-[16px] font-black tracking-widest uppercase transition-all opacity-60 cursor-not-allowed"
            >
              로그인 (로컬 placeholder)
            </button>

            <p className="text-[13px] font-semibold text-[#64748B] leading-relaxed">
              로컬에서는 “로그인 버튼이 화면을 여는지”까지만 확인해 주세요.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

