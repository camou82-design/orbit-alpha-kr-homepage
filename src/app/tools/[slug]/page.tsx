import { notFound } from 'next/navigation';
import { toolCategories } from '../data';

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ToolDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const category = toolCategories.find((item) => item.slug === slug);

  if (!category) {
    notFound();
  }

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
          <a
            href="/tools"
            className="inline-flex items-center gap-2 text-[12px] font-black tracking-[0.2em] uppercase text-[#00AFC4] mb-6"
          >
            <span>OrbitAlpha</span>
            <span className="text-slate-300">/</span>
            <span>Tools</span>
          </a>

          <div className="rounded-[32px] border border-slate-200 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-8 lg:p-10 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
              <div>
                <div className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] tracking-[0.18em] font-black uppercase ${category.badgeTone} mb-4`}>
                  {category.badge}
                </div>
                <h1 className="text-[34px] lg:text-[48px] font-black font-outfit text-[#0F172A] mb-4">
                  {category.label}
                </h1>
                <p className="max-w-[760px] text-[16px] lg:text-[18px] leading-8 text-[#475569] font-medium">
                  {category.description}
                </p>
              </div>
              <div className={`h-16 w-16 rounded-2xl border ${category.iconTone} flex items-center justify-center text-[20px] font-black tracking-[0.14em] shadow-sm`}>
                {category.icon}
              </div>
            </div>

            <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-6">
                <div className="text-[11px] font-black tracking-[0.2em] uppercase text-[#0891B2] mb-3">
                  대표 상품
                </div>
                <div className="text-[18px] font-bold text-[#0F172A] mb-2">{category.preview}</div>
                <div className="text-[14px] leading-7 text-[#64748B]">
                  상세 상품 리스트와 필터, 가격 비교, 추천 세트는 다음 단계에서 확장할 수 있는 구조로 연결됩니다.
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                <div className="text-[11px] font-black tracking-[0.2em] uppercase text-[#B98900] mb-3">
                  핵심 태그
                </div>
                <div className="flex flex-wrap gap-2 mb-6">
                  {category.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <a
                  href="/tools#category-grid"
                  className="inline-flex px-5 py-3 rounded-xl bg-[#FFD700] text-[#111827] text-[13px] font-black tracking-wide shadow-[0_12px_24px_rgba(255,215,0,0.25)] transition-all"
                >
                  현장별 카테고리 보기
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
