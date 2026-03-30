"use client";

import React, { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { BlogAutomationInputs, BlogDraftBundle } from "@/lib/blogAutomationDraft";
import {
  BLOG_MODEL_DEFAULT,
  BLOG_MODEL_QUALITY,
  type BlogGeneratePayload,
  type BlogModelId,
  payloadToBundle,
} from "@/lib/blogGenerate";

type GenMode = "full" | "blog" | "thread";

type Visible = {
  A: boolean;
  B: boolean;
  C: boolean;
  D: boolean;
  E: boolean;
};

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function CopyRow({
  label,
  text,
  children,
}: {
  label: string;
  text: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a1224]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#00F2FF]">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-[#00F2FF]/25 bg-[#0d1a2e] px-3 py-1.5 text-[12px] font-bold text-[#BDF8FF] transition hover:border-[#00F2FF]/45 hover:bg-[#12203a]"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      {children ?? <pre className="whitespace-pre-wrap font-inter text-[14px] leading-relaxed text-[#CBD5E1]">{text}</pre>}
    </div>
  );
}

function formatSnapshot(b: BlogDraftBundle, v: Visible, mode: GenMode | null, opts: BlogAutomationInputs): string {
  const parts: string[] = [];
  const showC = opts.infographic && b.infographic;
  const showE = opts.threads;
  if (mode === "thread") {
    parts.push("【E 쓰레드】\n" + threadsText(b));
    return parts.join("\n\n");
  }
  if (v.A) parts.push("【A 제목 3안】\n" + titlesPlain(b));
  if (v.B) parts.push("【B 본문】\n" + b.body);
  if (v.C && showC && b.infographic) parts.push("【C 인포그래픽】\n" + b.infographic);
  if (v.D) parts.push("【D 태그】\n" + b.tags.join(" "));
  if (v.E && showE) parts.push("【E 쓰레드】\n" + threadsText(b));
  return parts.join("\n\n---\n\n");
}

function titlesPlain(b: BlogDraftBundle): string {
  return `① ${b.titles[0]}\n② ${b.titles[1]}\n③ ${b.titles[2]}`;
}

function threadsText(b: BlogDraftBundle): string {
  return `〔본문형〕\n${b.threadBodyStyle}\n\n〔유입형〕\n${b.threadTrafficStyle}`;
}

function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/25 px-4 py-3">
      <div>
        <label htmlFor={id} className="text-[13px] font-bold text-white">
          {label}
        </label>
        {description ? <p className="mt-1 text-[12px] text-[#94A3B8]">{description}</p> : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-[#00F2FF]/35" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "left-5" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

function BlogAutomationSectionInner() {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const blogOpenParam = searchParams.get("blogOpen") === "1";
  const [adminAuthed, setAdminAuthed] = useState<boolean | null>(null);

  const [topic, setTopic] = useState("");
  const [perspective, setPerspective] = useState("");
  const [opinion, setOpinion] = useState("");
  const [lifePoint, setLifePoint] = useState("");
  const [clickbaitTitles, setClickbaitTitles] = useState(true);
  const [infographic, setInfographic] = useState(true);
  const [threads, setThreads] = useState(true);
  const [model, setModel] = useState<BlogModelId>(BLOG_MODEL_DEFAULT);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<BlogDraftBundle | null>(null);
  const [previousSnapshot, setPreviousSnapshot] = useState<string | null>(null);
  const [visible, setVisible] = useState<Visible>({ A: false, B: false, C: false, D: false, E: false });
  const [lastMode, setLastMode] = useState<GenMode | null>(null);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/homepage-admin-auth/logout", { method: "POST" });
    } finally {
      setAdminAuthed(false);
      setOpen(false);
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/homepage-admin-auth/status", { credentials: "include" });
        const json: unknown = await res.json().catch(() => ({}));
        const authed = Boolean((json as { authed?: unknown }).authed);
        if (!cancelled) setAdminAuthed(authed);
      } catch {
        if (!cancelled) setAdminAuthed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (adminAuthed === null) return;
    if (!blogOpenParam) return;

    if (!adminAuthed) {
      // 로그인 후 다시 도구가 열리도록 요청 경로를 전달
      router.replace(`/admin-login?returnTo=${encodeURIComponent("/?blogOpen=1")}`);
      return;
    }
    setOpen(true);
  }, [adminAuthed, blogOpenParam, router]);

  const inputs: BlogAutomationInputs = {
    topic,
    perspective,
    opinion,
    lifePoint,
    clickbaitTitles,
    infographic,
    threads,
  };

  const validate = useCallback(() => {
    if (!norm(topic)) {
      setError("오늘의 주제를 입력해 주세요.");
      return false;
    }
    setError(null);
    return true;
  }, [topic]);

  const pushHistory = useCallback(() => {
    if (bundle) {
      setPreviousSnapshot(formatSnapshot(bundle, visible, lastMode, inputs));
    }
  }, [bundle, visible, lastMode, inputs]);

  const applyVisibility = (mode: GenMode, b: BlogDraftBundle) => {
    if (mode === "full") {
      setVisible({
        A: true,
        B: true,
        C: Boolean(b.infographic) && infographic,
        D: true,
        E: threads,
      });
    } else if (mode === "blog") {
      setVisible({
        A: true,
        B: true,
        C: Boolean(b.infographic) && infographic,
        D: true,
        E: false,
      });
    } else {
      setVisible({
        A: false,
        B: false,
        C: false,
        D: false,
        E: threads,
      });
    }
  };

  const fetchBundle = useCallback(
    async (mode: GenMode, attempt: number): Promise<BlogDraftBundle> => {
      const res = await fetch("/api/blog-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          perspective,
          opinion,
          lifePoint,
          clickbaitTitles,
          infographic,
          threads,
          model,
        }),
      });
      let json: { ok?: boolean; error?: string; data?: BlogGeneratePayload };
      try {
        json = await res.json();
      } catch {
        throw new Error("응답을 해석하지 못했습니다.");
      }
      if (!res.ok || !json.ok || !json.data) {
        const msg = json.error ?? `요청 실패 (${res.status})`;
        const retryable = attempt < 1 && (res.status >= 500 || res.status === 429 || res.status === 0);
        if (retryable) {
          await new Promise((r) => setTimeout(r, 900));
          return fetchBundle(mode, attempt + 1);
        }
        throw new Error(msg);
      }
      return payloadToBundle(json.data, { infographic, threads, topic });
    },
    [topic, perspective, opinion, lifePoint, clickbaitTitles, infographic, threads, model],
  );

  const run = async (mode: GenMode) => {
    if (!validate()) return;
    if (mode === "thread" && !threads) {
      setError("쓰레드 초안 생성이 꺼져 있습니다. 토글을 켜 주세요.");
      return;
    }
    pushHistory();
    setLoading(true);
    setError(null);
    try {
      const b = await fetchBundle(mode, 0);
      setBundle(b);
      setLastMode(mode);
      applyVisibility(mode, b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 중 오류가 났습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [open]);

  const titlesText = (b: BlogDraftBundle) => titlesPlain(b);
  const tagsText = (b: BlogDraftBundle) => b.tags.join(" ");

  return (
    <>
      <div className="grid md:grid-cols-3 gap-8 mt-16">
        <button
          type="button"
          className="step-box text-left w-full cursor-pointer transition hover:border-[#00F2FF]/35 flex flex-col min-h-[260px]"
          onClick={() => {
            if (adminAuthed !== true) {
              router.replace(`/admin-login?returnTo=${encodeURIComponent("/?blogOpen=1")}`);
              return;
            }
            setOpen((o) => !o);
          }}
        >
          <span className="step-num">01</span>
          <div className="mb-3">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#94A3B8]">
              Internal Tool
            </div>
            <h3 className="mt-2 text-[20px] font-bold font-outfit">콘텐츠 운영 지원 도구</h3>
          </div>

          <p className="text-[#94A3B8] text-[15px] leading-relaxed max-w-[520px]">
            {adminAuthed === true ? (
              <>블로그 발행 흐름과 초안 정리를 지원하는 내부 운영 도구입니다.</>
            ) : adminAuthed === null ? (
              <>권한을 확인하는 중입니다…</>
            ) : (
              <>블로그 발행 흐름과 초안 정리를 지원하는 내부 운영 도구입니다.</>
            )}
          </p>

          <div className="mt-5 space-y-2">
            <p className="text-[#CBD5E1] text-[14px] leading-relaxed">발행 흐름 정리</p>
            <p className="text-[#CBD5E1] text-[14px] leading-relaxed">초안 검토 및 관리</p>
            <p className="text-[#CBD5E1] text-[14px] leading-relaxed">내부 운영용 로그인 환경</p>
          </div>

          <div className="mt-auto pt-6 flex items-center justify-between border-t border-white/10">
            <div className="text-[11px] font-bold text-[#64748B] tracking-wide">
              내부 운영 전용
            </div>
            <div className="px-4 py-2 rounded-xl border border-[#00F2FF]/35 bg-[#0b1526] text-[#00F2FF] text-[12px] font-black tracking-wide hover:bg-[#12203a] transition-all">
              {adminAuthed === true ? "자세히 보기" : "관리도구 로그인"}
            </div>
          </div>
        </button>

        <div className="step-box border-[#00F2FF]/30 flex flex-col min-h-[260px]">
          <span className="step-num">02</span>
          <div className="mb-3">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#94A3B8]">
              내부 처리 흐름
            </div>
            <h3 className="mt-2 text-[20px] font-bold font-outfit text-[#00F2FF]">운영 데이터 정리</h3>
          </div>
          <p className="text-[#94A3B8] text-[15px] leading-relaxed max-w-[520px]">
            수집된 데이터를 운영 화면에서 확인할 수 있도록 정리하는 내부 처리 흐름입니다.
          </p>
          <div className="mt-auto pt-6 border-t border-white/10 text-[11px] font-bold text-[#64748B] tracking-wide">
            표시용 요약 · 데이터 바인딩 유지
          </div>
        </div>

        <div className="step-box border-[#00F2FF]/30 flex flex-col min-h-[260px]">
          <span className="step-num">03</span>
          <div className="mb-3">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#94A3B8]">
              Separate Runtime
            </div>
            <h3 className="mt-2 text-[20px] font-bold font-outfit">트레이딩 운영 시스템</h3>
          </div>
          <p className="text-[#94A3B8] text-[15px] leading-relaxed max-w-[520px]">
            실시간 시세와 전략 운영 흐름을 별도 로그인 환경에서 관리하는 시스템입니다.
          </p>

          <div className="mt-5 space-y-2">
            <p className="text-[#CBD5E1] text-[14px] leading-relaxed">실시간 시장 모니터링</p>
            <p className="text-[#CBD5E1] text-[14px] leading-relaxed">전략 기반 운용</p>
            <p className="text-[#CBD5E1] text-[14px] leading-relaxed">운영 데이터 추적</p>
          </div>

          <div className="mt-auto pt-6 flex flex-col gap-3">
            <a
              href="https://trade.orbitalpha.kr/login"
              target="_blank"
              rel="noreferrer"
              className="px-5 py-3 rounded-xl btn-gold text-[14px] font-black tracking-wide transition-all text-center"
            >
              관리시스템 로그인
            </a>
            <Link
              href="/trading-intro"
              className="px-5 py-3 rounded-xl border border-[#00F2FF]/35 bg-[#0b1526] text-[#00F2FF] text-[14px] font-black tracking-wide hover:bg-[#12203a] transition-all text-center"
            >
              운영 소개
            </Link>
          </div>
        </div>
      </div>

      {open ? (
        <div
          ref={panelRef}
          id="blog-automation-tool"
          className="mt-10 rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:p-10"
        >
          <div className="mb-8 flex items-start justify-between gap-4 border-b border-white/10 pb-6">
            <div className="min-w-0">
              <div className="text-[12px] font-black uppercase tracking-[0.28em] text-[#00F2FF]">Blog Automation</div>
              <h3 className="mt-2 text-[22px] font-black font-outfit text-white lg:text-[26px]">경제 블로그 / 쓰레드 초안 생성기</h3>
              <p className="mt-2 max-w-[640px] text-[14px] text-[#94A3B8]">
                서버에서 OpenAI Responses API로 초안만 생성합니다. API 키는 서버에만 두고, 자동 발행·저장·로그인은 없습니다.
              </p>
            </div>
            {/* 패널이 열려 있으면 항상 노출 (인증 상태와 무관) */}
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[12px] font-bold text-[#CBD5E1] hover:border-[#00F2FF]/30 hover:text-white transition"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-[#00F2FF]/25 bg-[#0d1a2e] px-3 py-2 text-[12px] font-bold text-[#BDF8FF] hover:border-[#00F2FF]/45 hover:bg-[#12203a] transition"
              >
                로그아웃
              </button>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(280px,400px)_minmax(0,1fr)] lg:gap-10">
            {/* 입력 */}
            <div className="flex flex-col gap-4">
              <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[#94A3B8]">오늘의 주제</span>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="예: 국제유가 반등과 국내 기름값"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[14px] text-white outline-none transition focus:border-[#00F2FF]/45"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[#94A3B8]">핵심 시선 1줄</span>
                <input
                  value={perspective}
                  onChange={(e) => setPerspective(e.target.value)}
                  placeholder="이 이슈를 어떻게 읽을지 한 줄"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[14px] text-white outline-none transition focus:border-[#00F2FF]/45"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[#94A3B8]">내 의견 1줄</span>
                <input
                  value={opinion}
                  onChange={(e) => setOpinion(e.target.value)}
                  placeholder="개인적 해석·취향 (완곡하게)"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[14px] text-white outline-none transition focus:border-[#00F2FF]/45"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[#94A3B8]">생활 체감 포인트 1줄</span>
                <input
                  value={lifePoint}
                  onChange={(e) => setLifePoint(e.target.value)}
                  placeholder="장바구니, 환율, 통행료 등 일상 연결"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[14px] text-white outline-none transition focus:border-[#00F2FF]/45"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[#94A3B8]">모델</span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as BlogModelId)}
                  disabled={loading}
                  className="w-full cursor-pointer rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[14px] text-white outline-none transition focus:border-[#00F2FF]/45 disabled:opacity-50"
                >
                  <option value={BLOG_MODEL_DEFAULT}>{BLOG_MODEL_DEFAULT} · 기본</option>
                  <option value={BLOG_MODEL_QUALITY}>{BLOG_MODEL_QUALITY} · 품질 우선</option>
                </select>
              </label>

              <div className="mt-2 space-y-2">
                <Toggle
                  id={`${baseId}-click`}
                  checked={clickbaitTitles}
                  onChange={setClickbaitTitles}
                  label="클릭형 제목"
                  description="후킹은 살리되 과장은 줄인 제목 톤"
                />
                <Toggle
                  id={`${baseId}-info`}
                  checked={infographic}
                  onChange={setInfographic}
                  label="인포그래픽 프롬프트 생성"
                  description="제미나이에 붙여 넣을 짧은 이미지 프롬프트"
                />
                <Toggle
                  id={`${baseId}-thread`}
                  checked={threads}
                  onChange={setThreads}
                  label="쓰레드 초안 생성"
                  description="본문형·유입형 2안"
                />
              </div>

              {error ? <p className="text-[13px] font-semibold text-amber-300/95">{error}</p> : null}

              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void run("full")}
                  className="rounded-xl bg-[#00F2FF]/20 px-4 py-3 text-[13px] font-black tracking-wide text-[#BDF8FF] ring-1 ring-[#00F2FF]/35 transition hover:bg-[#00F2FF]/28 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "생성 중…" : "전체 생성"}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void run("blog")}
                  className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[13px] font-bold text-white transition hover:border-[#00F2FF]/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  블로그만 생성
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void run("thread")}
                  className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[13px] font-bold text-white transition hover:border-[#00F2FF]/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  쓰레드만 생성
                </button>
              </div>
            </div>

            {/* 결과 */}
            <div className="flex min-h-[min(70vh,720px)] flex-col rounded-2xl border border-white/10 bg-[#050a14]/80 lg:min-h-[560px]">
              <div className="border-b border-white/10 px-5 py-3 text-[12px] font-bold text-[#94A3B8]">
                생성 결과 {lastMode ? `· ${lastMode === "full" ? "전체" : lastMode === "blog" ? "블로그" : "쓰레드"}` : ""}{" "}
                {loading ? <span className="text-[#00F2FF]"> · OpenAI 호출 중…</span> : null}
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4 [scrollbar-color:rgba(0,242,255,0.22)_rgba(255,255,255,0.06)] [scrollbar-width:thin] lg:px-6 lg:py-5">
                {loading && !bundle ? (
                  <p className="text-[14px] leading-relaxed text-[#94A3B8]">OpenAI에서 초안을 가져오는 중입니다. 잠시만 기다려 주세요.</p>
                ) : !bundle ? (
                  <p className="text-[14px] leading-relaxed text-[#64748B]">
                    주제를 입력한 뒤 원하는 버튼을 누르면 이 영역에 초안이 표시됩니다. 오른쪽이 더 넓게 스크롤됩니다.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {loading ? (
                      <p className="text-[12px] font-semibold text-[#00F2FF]/90">새 초안을 불러오는 중입니다. 아래는 직전 결과입니다.</p>
                    ) : null}
                    {previousSnapshot ? (
                      <details className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4">
                        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-[13px] font-bold text-[#94A3B8]">
                          <span>이전 생성 결과 (비교·복사용)</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void navigator.clipboard.writeText(previousSnapshot);
                            }}
                            className="rounded-lg border border-white/15 px-2 py-1 text-[11px] font-bold text-[#00F2FF]/90 hover:border-[#00F2FF]/35"
                          >
                            전체 복사
                          </button>
                        </summary>
                        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap font-inter text-[12px] leading-relaxed text-[#64748B]">
                          {previousSnapshot}
                        </pre>
                      </details>
                    ) : null}

                    {visible.A ? <CopyRow label="A. 제목 3안" text={titlesText(bundle)} /> : null}
                    {visible.B ? <CopyRow label="B. 블로그 본문 초안" text={bundle.body} /> : null}
                    {visible.C && bundle.infographic ? (
                      <CopyRow label="C. 인포그래픽 프롬프트" text={bundle.infographic} />
                    ) : visible.C && !bundle.infographic ? (
                      <p className="text-[13px] text-[#64748B]">인포그래픽 프롬프트 생성이 꺼져 있어 항목 C를 건너뜁니다.</p>
                    ) : null}
                    {visible.D ? <CopyRow label="D. 태그 8개" text={tagsText(bundle)} /> : null}
                    {visible.E ? (
                      <CopyRow label="E. 쓰레드 초안 2안" text={threadsText(bundle)}>
                        <div className="space-y-4">
                          <div>
                            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[12px] font-bold text-[#94A3B8]">본문형</span>
                              <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(bundle.threadBodyStyle)}
                                className="text-[11px] font-bold text-[#00F2FF]/80 hover:text-[#00F2FF]"
                              >
                                이 블록만 복사
                              </button>
                            </div>
                            <p className="whitespace-pre-wrap font-inter text-[14px] leading-relaxed text-[#CBD5E1]">{bundle.threadBodyStyle}</p>
                          </div>
                          <div>
                            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[12px] font-bold text-[#94A3B8]">유입형</span>
                              <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(bundle.threadTrafficStyle)}
                                className="text-[11px] font-bold text-[#00F2FF]/80 hover:text-[#00F2FF]"
                              >
                                이 블록만 복사
                              </button>
                            </div>
                            <p className="whitespace-pre-wrap font-inter text-[14px] leading-relaxed text-[#CBD5E1]">{bundle.threadTrafficStyle}</p>
                          </div>
                        </div>
                      </CopyRow>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function BlogAutomationSection() {
  return (
    <Suspense
      fallback={
        <div className="mt-16 text-[14px] text-[#94A3B8] px-2">
          권한을 확인하는 중입니다…
        </div>
      }
    >
      <BlogAutomationSectionInner />
    </Suspense>
  );
}
