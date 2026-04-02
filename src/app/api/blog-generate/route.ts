import { NextResponse } from "next/server";
import OpenAI from "openai";
import { cookies } from "next/headers";
import { XMLParser } from "fast-xml-parser";
import {
  BLOG_MODEL_DEFAULT,
  BLOG_MODEL_QUALITY,
  BLOG_RESPONSE_JSON_SCHEMA,
  BLOG_SYSTEM_INSTRUCTIONS,
  type BlogGeneratePayload,
  buildBlogUserInput,
  isBlogModelId,
} from "@/lib/blogGenerate";

export const runtime = "nodejs";
export const maxDuration = 120;

function resolveModel(requested?: string): string {
  const envDefault = process.env.OPENAI_BLOG_MODEL;
  if (requested && isBlogModelId(requested)) return requested;
  if (envDefault && (envDefault === BLOG_MODEL_DEFAULT || envDefault === BLOG_MODEL_QUALITY)) return envDefault;
  return BLOG_MODEL_DEFAULT;
}

function parsePayload(raw: unknown): BlogGeneratePayload {
  const o = raw as Record<string, unknown>;
  const titles = o.titles as unknown[];
  const article = o.article as Record<string, string>;
  const tags = o.tags as unknown[];
  const threads = o.threads as Record<string, string>;
  if (!Array.isArray(titles) || titles.length !== 3) throw new Error("invalid titles");
  if (!article || typeof article !== "object") throw new Error("invalid article");
  if (!Array.isArray(tags) || tags.length !== 8) throw new Error("invalid tags");
  if (!threads || typeof threads !== "object") throw new Error("invalid threads");
  return {
    titles: [String(titles[0]), String(titles[1]), String(titles[2])],
    article: {
      intro: String(article.intro ?? ""),
      structure: String(article.structure ?? ""),
      impact: String(article.impact ?? ""),
      opinion: String(article.opinion ?? ""),
      summary: String(article.summary ?? ""),
    },
    infographic_prompt: String(o.infographic_prompt ?? ""),
    tags: tags.map((t) => String(t)),
    threads: {
      body_version: String(threads.body_version ?? ""),
      traffic_version: String(threads.traffic_version ?? ""),
    },
  };
}

type RssPost = {
  title: string;
  url: string;
  publishedAt?: string; // YYYY-MM-DD
  category?: string;
  summary?: string;
};

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function safeUrl(u: unknown): string | null {
  const s = typeof u === "string" ? u.trim() : "";
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  if (/(\/manage\b|\/admin\b|\/login\b|\/editor\b|\/write\b)/i.test(s)) return null;
  return s;
}

function fmtYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s가-힣]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return [];
  const stop = new Set([
    "그리고",
    "하지만",
    "그래서",
    "때문",
    "이유",
    "요즘",
    "오늘",
    "현재",
    "관련",
    "정리",
    "분석",
    "전망",
    "이슈",
    "경제",
    "시장",
    "한국",
    "사람",
    "경우",
    "것",
    "수",
    "등",
  ]);
  return raw
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !stop.has(t));
}

function pickKeywords(params: { topic: string; perspective: string; opinion: string; lifePoint: string; tags: string[] }): string[] {
  const fromTags = params.tags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
  const fromText = tokenize([params.topic, params.perspective, params.opinion, params.lifePoint].filter(Boolean).join(" "));
  const merged: string[] = [];
  for (const t of [...fromTags, ...fromText]) {
    const k = t.trim();
    if (!k) continue;
    if (merged.includes(k)) continue;
    merged.push(k);
    if (merged.length >= 10) break;
  }
  if (merged.length < 5) {
    for (const t of fromText) {
      if (!merged.includes(t)) merged.push(t);
      if (merged.length >= 5) break;
    }
  }
  return merged.slice(0, 10);
}

function titleLooksLikeNotice(title: string): boolean {
  return /(공지|공지사항|안내|업데이트|점검|필독)/i.test(title);
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

async function fetchRecentPosts(limit: number): Promise<RssPost[]> {
  const rssUrl = (process.env.TISTORY_RSS_URL ?? "https://blog.orbitalpha.kr/rss").trim();
  const res = await fetch(rssUrl, {
    next: { revalidate: 60 * 60 }, // 1시간 캐시 (생성 요청이 잦을 수 있어 financial-insights보다 짧게)
    headers: {
      "user-agent": "OrbitAlphaHomepage/1.0 (+blog-automation)",
      accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
    },
  });
  if (!res.ok) throw new Error(`RSS 요청 실패 (${res.status})`);
  const xml = await res.text();
  const parser = new XMLParser({
    ignoreAttributes: true,
    attributeNamePrefix: "",
    removeNSPrefix: true,
    trimValues: true,
    processEntities: false,
  });
  const data = parser.parse(xml) as any;
  const itemsRaw = toArray<any>(data?.rss?.channel?.item ?? data?.channel?.item);
  const out: RssPost[] = itemsRaw
    .map((it) => {
      const title = stripHtml(String(it?.title ?? "")).slice(0, 140);
      const url = safeUrl(it?.link) ?? safeUrl(it?.guid);
      if (!title || !url) return null;
      const pub = new Date(String(it?.pubDate ?? it?.published ?? ""));
      const publishedAt = Number.isFinite(pub.getTime()) ? fmtYmd(pub) : undefined;
      const category = stripHtml(String(it?.category ?? "")).slice(0, 60) || undefined;
      const rawDesc = String(it?.description ?? it?.["content:encoded"] ?? "");
      const plain = stripHtml(rawDesc);
      const summary = plain ? (plain.length > 180 ? `${plain.slice(0, 180)}…` : plain) : undefined;
      return { title, url, publishedAt, category, summary } satisfies RssPost;
    })
    .filter(Boolean) as RssPost[];

  // 최신순
  out.sort((a, b) => {
    const ad = a.publishedAt ?? "";
    const bd = b.publishedAt ?? "";
    return ad < bd ? 1 : ad > bd ? -1 : 0;
  });
  return out.slice(0, Math.max(10, limit));
}

function recommendInternalLinks(params: {
  keywords: string[];
  topic: string;
  posts: RssPost[];
}): { keywords: string[]; recommended: BlogGeneratePayload["internal_links"]["recommended"]; list_text: string; insert_block: string } {
  const now = new Date();
  const topicTokens = tokenize(params.topic);
  const keywords = params.keywords.filter(Boolean);

  const scored = params.posts
    .filter((p) => !titleLooksLikeNotice(p.title))
    .map((p) => {
      const hay = `${p.title} ${p.category ?? ""} ${p.summary ?? ""}`;
      const tokens = tokenize(hay);
      const dup = jaccard(topicTokens, tokenize(p.title));
      const pub = p.publishedAt ? new Date(p.publishedAt) : null;
      const ageDays = pub && Number.isFinite(pub.getTime()) ? daysBetween(now, pub) : 365;
      // 너무 오래된 글은 기본적으로 감점(필터는 아래에서 단계적으로 적용)
      const recency = Math.max(0, 1 - ageDays / 540); // 0~1 (약 18개월)
      let match = 0;
      for (const k of keywords) {
        if (!k) continue;
        if (p.title.includes(k)) match += 4;
        if ((p.category ?? "").includes(k)) match += 2;
        if ((p.summary ?? "").includes(k)) match += 1;
        if (tokens.includes(k.toLowerCase())) match += 1;
      }
      // 완전 중복(유사) 주제는 강하게 제외
      const duplicatePenalty = dup >= 0.75 ? 999 : dup >= 0.55 ? 3 : 0;
      const score = match + recency * 3 - duplicatePenalty;
      return { post: p, score, dup, ageDays, match };
    })
    .filter((x) => x.score > -50);

  scored.sort((a, b) => b.score - a.score);

  const tryPick = (maxAgeDays: number) => {
    const picked: typeof scored = [];
    for (const s of scored) {
      if (picked.length >= 3) break;
      if (s.dup >= 0.75) continue;
      if (s.ageDays > maxAgeDays) continue;
      // "완전 중복 주제" 외에도, 제목이 거의 같으면 하나만
      if (picked.some((p) => jaccard(tokenize(p.post.title), tokenize(s.post.title)) >= 0.65)) continue;
      picked.push(s);
    }
    return picked;
  };

  let picked = tryPick(540); // 18개월
  if (picked.length < 3) picked = tryPick(900); // 완화
  if (picked.length < 3) picked = tryPick(4000); // RSS에서 최대한 확보

  // 그래도 3개 미만이면 최신 글로 채움(공지/관리 URL 제외는 이미 safeUrl에서 처리)
  if (picked.length < 3) {
    for (const p of params.posts) {
      if (picked.length >= 3) break;
      if (titleLooksLikeNotice(p.title)) continue;
      if (picked.some((x) => x.post.url === p.url)) continue;
      picked.push({ post: p, score: 0, dup: 0, ageDays: 0, match: 0 });
    }
  }

  const rec = picked.slice(0, 3).map((x) => ({
    title: x.post.title,
    url: x.post.url,
    publishedAt: x.post.publishedAt,
    category: x.post.category,
    summary: x.post.summary,
    score: Math.round(x.score * 10) / 10,
  }));

  const listText = ["추천 내부링크:", ...rec.map((r) => `${r.title} / ${r.url}`)].join("\n");
  const insertBlock = ["하단 삽입 문구:", "함께 보면 좋은 글", ...rec.map((r) => r.title)].join("\n");

  return { keywords, recommended: rec, list_text: listText, insert_block: insertBlock };
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get("homepage_admin_auth")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ ok: false, error: "관리자 로그인 필요" }, { status: 401 });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "서버에 OPENAI_API_KEY 가 설정되어 있지 않습니다." },
      { status: 503 },
    );
  }

  let body: {
    topic?: string;
    perspective?: string;
    opinion?: string;
    lifePoint?: string;
    clickbaitTitles?: boolean;
    infographic?: boolean;
    threads?: boolean;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  const topic = (body.topic ?? "").trim();
  if (!topic) {
    return NextResponse.json({ ok: false, error: "오늘의 주제가 필요합니다." }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey: key });
  const model = resolveModel(body.model);
  const userInput = buildBlogUserInput({
    topic,
    perspective: (body.perspective ?? "").trim(),
    opinion: (body.opinion ?? "").trim(),
    lifePoint: (body.lifePoint ?? "").trim(),
    clickbaitTitles: Boolean(body.clickbaitTitles),
    includeInfographic: body.infographic !== false,
    includeThreads: body.threads !== false,
  });

  try {
    const response = await openai.responses.create({
      model,
      instructions: BLOG_SYSTEM_INSTRUCTIONS,
      input: userInput,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "blog_automation_bundle",
          strict: true,
          schema: BLOG_RESPONSE_JSON_SCHEMA as unknown as { [key: string]: unknown },
        },
        verbosity: "medium",
      },
      max_output_tokens: 8192,
    });

    if (response.error) {
      return NextResponse.json(
        { ok: false, error: response.error.message ?? "OpenAI 응답 오류" },
        { status: 502 },
      );
    }

    const text = response.output_text?.trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: "모델 출력이 비어 있습니다." }, { status: 502 });
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: "모델 JSON 파싱에 실패했습니다.", raw: text.slice(0, 500) },
        { status: 502 },
      );
    }

    let payload: BlogGeneratePayload;
    try {
      payload = parsePayload(json);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "스키마 검증 실패", raw: json },
        { status: 502 },
      );
    }

    // Internal link recommendation (display-layer only; 기존 글 본문/데이터는 수정하지 않음)
    try {
      const posts = await fetchRecentPosts(80);
      const keywords = pickKeywords({
        topic,
        perspective: (body.perspective ?? "").trim(),
        opinion: (body.opinion ?? "").trim(),
        lifePoint: (body.lifePoint ?? "").trim(),
        tags: payload.tags,
      });
      const rec = recommendInternalLinks({ keywords, topic, posts });
      payload.internal_links = {
        keywords: rec.keywords.slice(0, 10),
        recommended: rec.recommended,
        list_text: rec.list_text,
        insert_block: rec.insert_block,
      };
    } catch {
      // 추천 실패 시에도 결과는 반환(본문 생성이 우선). UI에서는 내부링크 블록을 생략.
    }

    return NextResponse.json({ ok: true, model, data: payload });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string; error?: { message?: string } };
    const msg =
      err?.error?.message ??
      err?.message ??
      (e instanceof Error ? e.message : "OpenAI 요청 실패");
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 502;
    return NextResponse.json({ ok: false, error: msg }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}
