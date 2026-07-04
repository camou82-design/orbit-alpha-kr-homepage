export default function ToolsPage() {
  return (
    <main
      className="min-h-screen text-[#0F172A]"
      style={{
        background:
          'radial-gradient(circle at 12% 10%, rgba(0, 242, 255, 0.08), transparent 24%), radial-gradient(circle at 88% 12%, rgba(255, 215, 0, 0.10), transparent 20%), linear-gradient(180deg, #F8FBFF 0%, #EEF4FA 100%)',
      }}
    >
      <section className="py-16 lg:py-24">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
          <div className="mb-10 lg:mb-14">
            <a
              href="/"
              className="inline-flex items-center gap-2 text-[12px] font-black tracking-[0.2em] uppercase text-[#00F2FF] mb-5"
            >
              <span>OrbitAlpha</span>
              <span className="text-slate-300">/</span>
              <span>Home</span>
            </a>
            <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.24em] uppercase mb-4">
              Tools Hub
            </div>
            <h1 className="text-[32px] lg:text-[48px] font-black font-outfit mb-4 text-[#0F172A]">
              운영 자동화 도구
            </h1>
            <p className="max-w-[820px] text-[16px] lg:text-[18px] leading-8 text-[#475569] font-medium">
              구매대행 상품 심사, 현장 공구·자재 전문관, 운영 리스크 체크 도구를 순차적으로 붙여갑니다. 지금은 자동등록 전 위험 상품을 먼저 걸러내는 구매대행 심사 MVP부터 사용할 수 있습니다.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
            <a
              href="/tools/purchase-agent"
              className="group rounded-[32px] border border-cyan-200 bg-white/90 px-6 py-7 lg:px-8 lg:py-8 shadow-[0_20px_60px_rgba(15,23,42,0.10)] transition-all hover:-translate-y-1 hover:border-[#00F2FF]/70 hover:shadow-[0_28px_80px_rgba(0,242,255,0.16)]"
            >
              <div className="text-[12px] font-black tracking-[0.24em] uppercase text-[#00A8B8] mb-3">
                Purchase Agent MVP
              </div>
              <div className="text-[24px] lg:text-[30px] font-black font-outfit text-[#0F172A] mb-4">
                구매대행 상품 심사기
              </div>
              <div className="text-[15px] leading-7 text-[#475569] font-medium mb-7">
                상품명, 원가, 판매가, 배송비, 옵션 수, 공급사 점수를 입력하면 판매 후보·관찰 후보·수기 검토·탈락으로 나눕니다.
              </div>
              <div className="flex flex-wrap gap-2.5 mb-7">
                {['마진 계산', '위험 키워드 차단', '후보 저장', 'CSV 내보내기'].map((item) => (
                  <span key={item} className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1.5 text-[12px] font-black text-[#0E7490]">
                    {item}
                  </span>
                ))}
              </div>
              <div className="inline-flex rounded-xl bg-[#0F172A] px-5 py-3 text-[13px] font-black text-white transition-all group-hover:bg-[#00A8B8]">
                심사기 열기 →
              </div>
            </a>

            <div className="rounded-[32px] border border-slate-200 bg-white/75 px-6 py-7 lg:px-8 lg:py-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="text-[12px] font-black tracking-[0.24em] uppercase text-slate-500 mb-3">
                Field Supplies
              </div>
              <div className="text-[24px] lg:text-[30px] font-black font-outfit text-[#0F172A] mb-4">
                현장 공구·자재 전문관
              </div>
              <div className="text-[15px] leading-7 text-[#475569] font-medium mb-7">
                현장 기본용품, 형틀, 전기, 설비, 해체정리, 시스템 비계 관련 품목을 정리하는 전문관은 다음 단계로 붙입니다.
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-[13px] font-black text-slate-500">
                준비 중
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-slate-200 bg-white/70 px-6 py-6 lg:px-8 text-[14px] leading-7 text-[#475569] font-medium">
            운영 기준: 자동등록보다 먼저 위험 상품을 걸러냅니다. KC, 전기·배터리, 식품 접촉, 의료·화장품, 브랜드/상표권, 파손·옵션·반품 리스크가 있는 상품은 바로 등록하지 않고 검토 또는 탈락 처리합니다.
          </div>
        </div>
      </section>
    </main>
  );
}
