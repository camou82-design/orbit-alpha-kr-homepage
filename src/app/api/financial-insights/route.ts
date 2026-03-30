import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

export const runtime = "nodejs";

type InsightItem = {
  title: string;
  summary: string;
  href: string;
  meta: string;
  publishedAt: string; // YYYY-MM-DD
};

/**
 * DEV MEMO (혼동 방지)
 * - blog.orbitalpha.kr 은 티스토리(다음/카카오) 블로그의 "커스텀 도메인"입니다.
 * - 관리자 메뉴(관리/글쓰기 등)가 보이는 것은 이 Next.js 홈페이지 권한/보안 문제가 아니라,
 *   사용자의 브라우저에 남아있는 "티스토리 로그인 세션(쿠키)" 때문에 티스토리 쪽 UI가 관리자 모드로 렌더링되는 현상입니다.
 * - 이 홈페이지는 티스토리에 로그인/글쓰기 권한을 부여하거나 프록시하지 않습니다:
 *   여기서는 RSS를 읽어 최신 글 링크를 노출할 뿐이며, 글 작성/관리 API는 존재하지 않습니다.
 */
const BLOG_HOME_PUBLIC = "https://blog.orbitalpha.kr";

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

function fmtDate(d: Date): { ymd: string; dot: string } {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return { ymd: `${y}-${m}-${day}`, dot: `${y}.${m}.${day}` };
}

function safeUrl(u: unknown): string | null {
  const s = typeof u === "string" ? u.trim() : "";
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  // Prevent accidentally returning admin/editor/login/manage URLs
  if (/(\/manage\b|\/admin\b|\/login\b|\/editor\b|\/write\b)/i.test(s)) return null;
  return s;
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export async function GET() {
  const rssUrl = (process.env.TISTORY_RSS_URL ?? "https://blog.orbitalpha.kr/rss").trim();

  try {
    const res = await fetch(rssUrl, {
      // 하루 1회 캐시 (Next fetch cache)
      next: { revalidate: 60 * 60 * 24 },
      headers: {
        "user-agent": "OrbitAlphaHomepage/1.0 (+local-dev)",
        accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, rssUrl, error: `RSS 요청 실패 (${res.status})` },
        { status: 502 },
      );
    }

    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: true,
      attributeNamePrefix: "",
      removeNSPrefix: true,
      trimValues: true,
      // Tistory RSS may contain many entities; disable entity processing to avoid expansion limit failures.
      processEntities: false,
    });

    const data = parser.parse(xml) as any;
    const itemsRaw = toArray<any>(data?.rss?.channel?.item ?? data?.channel?.item);
    if (!itemsRaw.length) {
      return NextResponse.json(
        { ok: false, rssUrl, error: "RSS 항목이 비어 있습니다." },
        { status: 502 },
      );
    }

    const items: InsightItem[] = itemsRaw
      .map((it) => {
        const title = stripHtml(String(it?.title ?? "")).slice(0, 120);
        const href = safeUrl(it?.link) ?? safeUrl(it?.guid);
        const pub = new Date(String(it?.pubDate ?? it?.published ?? ""));
        const dateOk = Number.isFinite(pub.getTime());
        const { ymd, dot } = fmtDate(dateOk ? pub : new Date());

        const rawDesc = String(it?.description ?? it?.["content:encoded"] ?? "");
        const plain = stripHtml(rawDesc);
        const summary = plain.length > 110 ? `${plain.slice(0, 110)}…` : plain;

        if (!title || !href) return null;
        return {
          title,
          href,
          publishedAt: ymd,
          meta: `TISTORY · ${dot}`,
          summary: summary || "요약을 불러오지 못했습니다.",
        } satisfies InsightItem;
      })
      .filter(Boolean) as InsightItem[];

    items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));

    const blogHome = BLOG_HOME_PUBLIC;

    return NextResponse.json({
      ok: true,
      source: "rss" as const,
      rssUrl,
      blogHome,
      items: items.slice(0, 3),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, rssUrl, error: e instanceof Error ? e.message : "RSS 파싱 실패" },
      { status: 502 },
    );
  }
}

