"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type StatusResponse = { ok?: boolean; authed?: boolean };

function AdminLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/homepage-admin-auth/status", { credentials: "include" });
        const json: StatusResponse = await res.json().catch(() => ({}));
        setAuthed(Boolean(json.authed));
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/homepage-admin-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, returnTo }),
      });
      const json: { ok?: boolean; error?: string; redirectTo?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "로그인 실패");
      }
      router.replace(json.redirectTo ?? returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const onLogout = async () => {
    await fetch("/api/homepage-admin-auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/");
  };

  return (
    <div className="min-h-screen bg-[#030509] text-[#F8FAFC] font-sans px-6 py-16">
      <div className="max-w-md mx-auto">
        <div className="mb-6">
          <div className="text-[12px] font-black uppercase tracking-[0.28em] text-[#00F2FF] mb-3">ADMIN LOGIN</div>
          <h1 className="text-[26px] font-black font-outfit">Blog Automation 관리자 로그인</h1>
          <p className="text-[#94A3B8] mt-2 text-[14px] leading-relaxed">로그인 후에만 Blog Automation 도구를 사용할 수 있습니다.</p>
        </div>

        {authed ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[#CBD5E1] text-[14px] leading-relaxed">이미 로그인되어 있습니다.</p>
            <button
              type="button"
              onClick={onLogout}
              className="mt-4 w-full rounded-xl bg-[#00F2FF]/20 px-4 py-3 text-[13px] font-black tracking-wide text-[#BDF8FF] ring-1 ring-[#00F2FF]/35 transition hover:bg-[#00F2FF]/28"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[#94A3B8]">비밀번호</span>
              <input
                value={password}
                type="password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="관리자 비밀번호"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[14px] text-white outline-none transition focus:border-[#00F2FF]/45"
              />
            </label>

            {error ? <p className="mt-4 text-[13px] font-semibold text-amber-300/95">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-[#00F2FF]/20 px-4 py-3 text-[13px] font-black tracking-wide text-[#BDF8FF] ring-1 ring-[#00F2FF]/35 transition hover:bg-[#00F2FF]/28 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "로그인 중…" : "로그인"}
            </button>
          </form>
        )}

        <p className="mt-5 text-[12px] text-[#64748B]">Tip: 로그인은 이 홈페이지 전용 쿠키로만 처리됩니다.</p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#030509] text-[#F8FAFC] font-sans px-6 py-16">
          <div className="max-w-md mx-auto">
            <div className="text-[#94A3B8] text-[14px]">로딩 중…</div>
          </div>
        </div>
      }
    >
      <AdminLoginInner />
    </Suspense>
  );
}

