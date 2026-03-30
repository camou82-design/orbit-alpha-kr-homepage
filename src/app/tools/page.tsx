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
              <span className="text-white/20">/</span>
              <span>Home</span>
            </a>
            <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.24em] uppercase mb-4">
              Tools Hub
            </div>
            <h1 className="text-[32px] lg:text-[48px] font-black font-outfit mb-4 text-[#0F172A]">공구 전문관 점검 중</h1>
            <p className="max-w-[760px] text-[16px] lg:text-[18px] leading-8 text-[#475569] font-medium">
              현재 운영 구조 및 사업 목적 정리 후 순차적으로 오픈될 예정입니다.
            </p>
            <p className="mt-3 max-w-[760px] text-[15px] leading-7 text-[#64748B] font-semibold">
              보다 안정적인 구성으로 제공하기 위해 준비 중입니다.
            </p>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white/80 px-6 py-7 lg:px-8 lg:py-8 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
            <div className="text-[12px] font-black tracking-[0.24em] uppercase text-slate-500 mb-3">
              Notice
            </div>
            <div className="text-[18px] lg:text-[20px] font-black font-outfit text-[#0F172A] mb-3">
              점검 기간에는 구매/바로가기 기능이 제공되지 않습니다.
            </div>
            <div className="text-[14px] leading-7 text-[#475569] font-medium">
              오픈 전 운영 구조 정리 및 안정화 작업을 진행 중입니다. 준비가 완료되면 순차적으로 오픈하겠습니다.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
