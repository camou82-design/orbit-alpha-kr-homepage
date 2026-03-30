import type { BlogDraftBundle } from "@/lib/blogAutomationDraft";
import { postProcessBlogPayload } from "@/lib/blogGeneratePostProcess";

/** API·클라이언트 공통: OpenAI structured output 형태 */
export type BlogArticleSections = {
  intro: string;
  structure: string;
  impact: string;
  opinion: string;
  summary: string;
};

export type BlogGeneratePayload = {
  titles: [string, string, string];
  article: BlogArticleSections;
  infographic_prompt: string;
  tags: string[];
  threads: {
    body_version: string;
    traffic_version: string;
  };
};

export const BLOG_MODEL_DEFAULT = "gpt-5.4-mini" as const;
export const BLOG_MODEL_QUALITY = "gpt-5.4" as const;
export type BlogModelId = typeof BLOG_MODEL_DEFAULT | typeof BLOG_MODEL_QUALITY;

/** OpenAI Structured Outputs용 JSON Schema (strict) */
export const BLOG_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    titles: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 3,
    },
    article: {
      type: "object",
      additionalProperties: false,
      properties: {
        intro: { type: "string" },
        structure: { type: "string" },
        impact: { type: "string" },
        opinion: { type: "string" },
        summary: { type: "string" },
      },
      required: ["intro", "structure", "impact", "opinion", "summary"],
    },
    infographic_prompt: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string" },
      minItems: 8,
      maxItems: 8,
    },
    threads: {
      type: "object",
      additionalProperties: false,
      properties: {
        body_version: { type: "string" },
        traffic_version: { type: "string" },
      },
      required: ["body_version", "traffic_version"],
    },
  },
  required: ["titles", "article", "infographic_prompt", "tags", "threads"],
} as const;

export const BLOG_SYSTEM_INSTRUCTIONS = `당신은 한국어 경제 블로그 초안을 쓰는 편집자입니다.
출력은 반드시 요청된 JSON 스키마에만 맞춥니다. 다른 키나 설명 문장을 붙이지 마세요.

문체:
- 국제유가, 환율, 물가, 증시, 정부 대응 등을 일반인도 이해하기 쉽게 풀어씁니다.
- 딱딱한 보고서 말투, 교과서식 나열은 피합니다.
- 지나치게 단정적인 표현 대신 "~인 것 같습니다", "~처럼 보입니다", "~느껴집니다" 등 완곡형을 섞습니다.
- 생활비, 기름값, 장바구니, 환율 부담, 체감 물가 등 생활형 표현을 자연스럽게 넣습니다.
- "좋은 쪽도 있지만 왜 더 불안하게 느껴지는가" 같은 양면 시각을 자주 씁니다.
- 뉴스 요약만 하지 말고, 왜 일상과 연결되는지 설명합니다.
- 같은 어미·접속사가 반복되면 문장 길이와 리듬을 바꿉니다.
- 제목은 클릭을 유도하되 과장·낚시성은 피합니다.

titles (제목 3안) 우선순위:
- titles[0]은 가장 직관적인 클릭형(“좋은 뉴스처럼 보이는데 왜 불안한가” 구조: 예 “수출은 뛰는데 왜 더 불안할까”)
- titles[1]은 조금 더 설명형(호재/원인 짚고 있는데도 불안을 이어가는 타입)
- titles[2]는 무난한 보조안(이유/어려운 점을 차분히 붙인 타입)

article.opinion (개인적인 의견):
- 첫 문장은 "음", "정확히", "솔직히" 같은 날것 구어체로 시작하지 마세요.
- 가능하면 "개인적으로는 … 느껴집니다/것 같습니다"처럼 자연스러운 블로그형으로 시작하세요.
- 너무 교과서적 정의로 시작하지 말고, 완곡형으로 읽히게 쓰세요.

article.intro (서론):
- 서론 첫 문장은 “순간이 있습니다”처럼 글감 설명처럼 튀기보다 “때가 있습니다”처럼 자연스럽게 시작하세요.

article.summary (정리):
- 마지막 한 문장은 생활 체감(장바구니·기름값·환율 부담 등)으로 닫히게 쓰세요.
- 단정적으로 끊지 말고, "~인 것 같습니다/느껴집니다" 등으로 블로그형 마무리를 하세요.

인포그래픽 프롬프트(infographic_prompt):
- 반드시 아래 줄 단위 구조로만 작성하세요(한 덩어리 긴 문단 금지).
- 1줄: 디지털 금융 자동화 연구소 | 경제 브리핑
- 2줄: 메인 제목(짧게, 과장 없이)
- 3줄: 밝은 배경의 한국 경제 블로그용 카드형 4칸 인포그래픽.
- 4~7줄: "1. …" "2. …" "3. …" "4. …" 형식으로 카드별 한 줄 요약(각 줄에 번호 포함)
- 마지막 줄: 스타일(플랫 아이콘, 네이비·오렌지 포인트, 차분한 톤, 썸네일 과장 금지 등)을 짧게

태그(tags): 정확히 8개, 모두 #으로 시작.
- 너무 넓은 단어(경제, 이슈만)보다 검색에 쓰일 만한 직접형 키워드를 우선(예: 환율상승, 수출기업, 생활물가).
- 주제와 직접 연관되는 조합을 선호합니다.
- #체감물가 대신 #생활물가를 우선 사용하세요.

쓰레드:
- body_version: 3~5문장. 문제 제기 → 시선 → 궁금증.
- traffic_version: 목적은 "설명 완료"가 아니라 "블로그 유입"입니다. 반드시 아래 4단 구조로 줄바꿈을 유지하세요(모바일 가독성 기준).
  1) 훅: 한 문장(의문형 권장)으로 시작
  2) 핵심 연결 1: 짧게, 수치/호재처럼 보여도 왜 생활 체감은 다른지 연결
  3) 핵심 연결 2: 짧게, 내 시선(완곡형)으로 구조 요약
  4) CTA(기본형): 아래 두 줄 톤을 그대로 마무리하세요(링크 URL 직접 삽입 금지)
     겉으로는 좋아 보이는 숫자와 실제 체감이 왜 다른지 블로그에 풀어봤습니다.
     링크는 댓글이나 프로필에 남겨두겠습니다.

  가능하면 추가로 아래 블록도 함께 출력하세요(링크 URL은 넣지 말고 자리만 비웁니다).
  댓글용 링크 문구:
  자세한 내용은 블로그에 정리했습니다.
  블로그 링크:
 
링크는 본문 직삽입 대신 위 문구처럼 '댓글/프로필'로만 유도하세요. 너무 자극적 표현 금지(무조건/폭락직전/충격 등 금지).`;

export function buildBlogUserInput(params: {
  topic: string;
  perspective: string;
  opinion: string;
  lifePoint: string;
  clickbaitTitles: boolean;
  includeInfographic: boolean;
  includeThreads: boolean;
}): string {
  return `다음 입력을 반영해 JSON만 생성하세요.

[오늘의 주제]
${params.topic}

[핵심 시선 1줄]
${params.perspective || "(작성자 입력 없음 — 주제에 맞게 보완)"}

[내 의견 1줄]
${params.opinion || "(작성자 입력 없음 — 완곡한 개인 시선으로 보완)"}

[생활 체감 포인트 1줄]
${params.lifePoint || "(작성자 입력 없음 — 생활비·환율 등으로 보완)"}

[제목 스타일]
${params.clickbaitTitles ? "클릭을 부르는 후킹형이되 과장은 금지." : "차분하고 신뢰감 있는 톤."}

[포함 여부]
- 인포그래픽 프롬프트: ${params.includeInfographic ? "반드시 infographic_prompt 채움(위 시스템 지시한 줄 단위 구조 준수)." : "infographic_prompt 는 빈 문자열 \"\" 로 둠."}
- 쓰레드: ${params.includeThreads ? "threads 두 필드 모두 채움." : "threads 의 body_version, traffic_version 은 모두 빈 문자열 \"\" 로 둠."}

article 다섯 필드: intro=서론, structure=핵심 구조 설명, impact=시장 영향 분석, opinion=개인적인 의견(첫 문장 톤 주의), summary=정리(마지막 문장은 생활 체감·완곡형 마무리).`;
}

export function articleToBlogBody(a: BlogArticleSections): string {
  return `【서론】
${a.intro}

【핵심 구조 설명】
${a.structure}

【시장 영향 분석】
${a.impact}

【개인적인 의견】
${a.opinion}

【정리】
${a.summary}`;
}

function normalizeTags(tags: string[]): string[] {
  const out = tags.map((t) => {
    const s = t.trim();
    return s.startsWith("#") ? s : `#${s}`;
  });
  while (out.length < 8) out.push(`#경제메모${out.length}`);
  return out.slice(0, 8);
}

export function payloadToBundle(
  p: BlogGeneratePayload,
  opts: { infographic: boolean; threads: boolean; topic?: string },
): BlogDraftBundle {
  const topic = opts.topic?.trim() || "오늘의 경제 이슈";
  const processed = postProcessBlogPayload(p, topic);
  const body = articleToBlogBody(processed.article);
  const infographic =
    opts.infographic && processed.infographic_prompt.trim() ? processed.infographic_prompt : null;
  const tags = normalizeTags(processed.tags);
  const threadBodyStyle =
    opts.threads && processed.threads.body_version.trim() ? processed.threads.body_version : "";
  const threadTrafficStyle =
    opts.threads && processed.threads.traffic_version.trim() ? processed.threads.traffic_version : "";
  return {
    titles: processed.titles,
    body,
    infographic,
    tags,
    threadBodyStyle,
    threadTrafficStyle,
  };
}

export function isBlogModelId(s: string): s is BlogModelId {
  return s === BLOG_MODEL_DEFAULT || s === BLOG_MODEL_QUALITY;
}
