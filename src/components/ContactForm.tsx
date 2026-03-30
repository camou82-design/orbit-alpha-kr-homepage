"use client";

import React, { useState } from "react";
import { CONTACT_FORM_MIN_MS, CONTACT_MESSAGE_MIN_LENGTH, isValidEmail } from "@/lib/contact";

const INTEREST_OPTIONS = [
  { value: "supply_chain_esg", label: "Supply Chain ESG" },
  { value: "insurance_risk", label: "Insurance Risk Pricing" },
  { value: "investment_screening", label: "Investment Screening" },
  { value: "strategic_partnership", label: "Strategic Partnership" },
] as const;

export function ContactForm() {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState<string>(INTEREST_OPTIONS[0].value);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [formOpenTs, setFormOpenTs] = useState(() => Date.now());

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err" | "hint"; text: string } | null>(null);

  const inputClass =
    "w-full bg-black/50 border border-white/10 rounded-xl px-5 py-4 focus:border-[#00F2FF]/50 transition-all outline-none text-white placeholder:text-[#64748B]";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const cn = companyName.trim();
    const tn = contactName.trim();
    const em = email.trim();
    const msg = message.trim();

    if (!cn || !tn || !em || !msg) {
      setFeedback({ kind: "hint", text: "필수 항목(회사명, 담당자, 이메일, 문의 메시지)을 모두 입력해 주세요." });
      return;
    }
    if (!isValidEmail(em)) {
      setFeedback({ kind: "hint", text: "올바른 이메일 형식인지 확인해 주세요." });
      return;
    }
    if (msg.length < CONTACT_MESSAGE_MIN_LENGTH) {
      setFeedback({
        kind: "hint",
        text: `문의 메시지는 ${CONTACT_MESSAGE_MIN_LENGTH}자 이상 입력해 주세요.`,
      });
      return;
    }
    if (formOpenTs > 0 && Date.now() - formOpenTs < CONTACT_FORM_MIN_MS) {
      setFeedback({ kind: "hint", text: "잠시 후 다시 시도해 주세요." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: cn,
          contactName: tn,
          email: em,
          interest,
          message: msg,
          website,
          formOpenTs,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (res.ok && data.ok) {
        setFeedback({ kind: "ok", text: "문의가 정상 접수되었습니다." });
        setCompanyName("");
        setContactName("");
        setEmail("");
        setInterest(INTEREST_OPTIONS[0].value);
        setMessage("");
        setWebsite("");
        setFormOpenTs(Date.now());
        return;
      }

      if (res.status === 503 && data.error === "server_config") {
        setFeedback({ kind: "err", text: "전송 중 문제가 발생했습니다. 다시 시도해주세요." });
        return;
      }

      if (data.error === "too_fast") {
        setFeedback({ kind: "hint", text: "잠시 후 다시 시도해 주세요." });
        return;
      }
      if (data.error === "required" || data.error === "email" || data.error === "message_short") {
        setFeedback({ kind: "hint", text: "입력 내용을 확인한 뒤 다시 시도해 주세요." });
        return;
      }

      setFeedback({ kind: "err", text: "전송 중 문제가 발생했습니다. 다시 시도해주세요." });
    } catch {
      setFeedback({ kind: "err", text: "전송 중 문제가 발생했습니다. 다시 시도해주세요." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-[32px] p-6 lg:p-10 backdrop-blur-3xl shadow-2xl">
      <form className="space-y-6" onSubmit={onSubmit} noValidate>
        {/* honeypot — 사람은 보이지 않음 */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">회사명</label>
            <input
              type="text"
              name="companyName"
              placeholder="예: HSE&C"
              className={inputClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div>
            <label className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">성함/담당자</label>
            <input
              type="text"
              name="contactName"
              placeholder="홍길동 팀장"
              className={inputClass}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">이메일</label>
          <input
            type="email"
            name="email"
            placeholder="contact@company.com"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />
        </div>
        <div>
          <label className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">관심 분야</label>
          <select
            name="interest"
            className={`${inputClass} appearance-none cursor-pointer`}
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            disabled={loading}
          >
            {INTEREST_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">문의 메세지</label>
          <textarea
            name="message"
            rows={4}
            placeholder="문의하실 내용을 입력해주세요."
            className={`${inputClass} resize-none`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        {feedback ? (
          <p
            role="status"
            className={`text-[14px] font-semibold leading-relaxed ${
              feedback.kind === "ok"
                ? "text-emerald-400/95"
                : feedback.kind === "hint"
                  ? "text-amber-200/95"
                  : "text-red-400/95"
            }`}
          >
            {feedback.text}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-5 rounded-2xl btn-gold text-[16px] font-black tracking-widest uppercase transition-all disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "전송 중…" : "문의 보내기"}
        </button>
      </form>
    </div>
  );
}
