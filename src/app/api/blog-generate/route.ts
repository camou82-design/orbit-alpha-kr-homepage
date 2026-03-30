import { NextResponse } from "next/server";
import OpenAI from "openai";
import { cookies } from "next/headers";
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
