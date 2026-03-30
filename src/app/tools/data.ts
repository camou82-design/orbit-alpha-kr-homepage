export type ToolCategory = {
  slug: string;
  label: string;
  badge: string;
  promo: string;
  description: string;
  tags: string[];
  preview: string;
  icon: string;
  tone: string;
  badgeTone: string;
  iconTone: string;
  featured?: boolean;
};

export const toolCategories: ToolCategory[] = [
  {
    slug: 'basic-supplies',
    label: '건설 기본용품',
    badge: '인기 현장 세트',
    promo: '현장 필수',
    description: '처음 현장 투입 전 가장 먼저 준비하는 기본 보호구 세트',
    tags: ['안전모', '장갑', '안전화'],
    preview: '안전모 세트 / 절연장갑 / 미끄럼방지 안전화',
    icon: 'HS',
    tone: 'border-white/10',
    badgeTone: 'text-white/80 bg-white/10 border-white/10',
    iconTone: 'bg-white/10 text-white/80 border-white/10',
    featured: true,
  },
  {
    slug: 'formwork',
    label: '형틀',
    badge: '많이 찾는 품목',
    promo: '타격·체결',
    description: '폼타이, 망치, 절단공구 중심 작업',
    tags: ['폼타이', '망치', '절단공구'],
    preview: '폼타이 박스 / 해머 / 충전 절단공구',
    icon: 'FT',
    tone: 'border-[#FFD700]/18',
    badgeTone: 'text-[#FFD700] bg-[#FFD700]/10 border-[#FFD700]/20',
    iconTone: 'bg-[#FFD700]/12 text-[#FFD700] border-[#FFD700]/20',
  },
  {
    slug: 'electrical',
    label: '전기',
    badge: '추천 세트',
    promo: '배선·측정',
    description: '압착, 스트리핑, 전기 점검 작업',
    tags: ['스트리퍼', '압착기', '테스터기'],
    preview: '스트리퍼 킷 / 압착기 / 디지털 테스터기',
    icon: 'EL',
    tone: 'border-[#00F2FF]/22',
    badgeTone: 'text-[#8EF7FF] bg-[#00F2FF]/10 border-[#00F2FF]/20',
    iconTone: 'bg-[#00F2FF]/12 text-[#8EF7FF] border-[#00F2FF]/20',
  },
  {
    slug: 'plumbing',
    label: '설비',
    badge: '프로 선택',
    promo: '배관 작업',
    description: '파이프 절단과 체결에 필요한 기본 공구',
    tags: ['파이프렌치', '커터', '토치'],
    preview: '파이프렌치 / 커터 / 토치 구성',
    icon: 'PL',
    tone: 'border-white/10',
    badgeTone: 'text-white/80 bg-white/10 border-white/10',
    iconTone: 'bg-white/10 text-white/80 border-white/10',
  },
  {
    slug: 'demolition-cleanup',
    label: '해체정리',
    badge: '현장 추천',
    promo: '철거·정리',
    description: '해체와 폐기물 반출에 필요한 작업 공구',
    tags: ['바루', '해머', '폐기물정리'],
    preview: '철거 해머 / 바루 / 정리용품 묶음',
    icon: 'DJ',
    tone: 'border-[#FFD700]/18',
    badgeTone: 'text-[#FFD700] bg-[#FFD700]/10 border-[#FFD700]/20',
    iconTone: 'bg-[#FFD700]/12 text-[#FFD700] border-[#FFD700]/20',
  },
  {
    slug: 'system-scaffolding',
    label: '시스템 비계',
    badge: '안전 작업군',
    promo: '비계 작업',
    description: '비계 자재 체결과 안전발판 작업',
    tags: ['비계자재', '클램프', '안전발판'],
    preview: '클램프 / 발판 / 비계 부속품 구성',
    icon: 'SC',
    tone: 'border-[#00F2FF]/22',
    badgeTone: 'text-[#8EF7FF] bg-[#00F2FF]/10 border-[#00F2FF]/20',
    iconTone: 'bg-[#00F2FF]/12 text-[#8EF7FF] border-[#00F2FF]/20',
  },
];
