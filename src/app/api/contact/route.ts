import { NextResponse } from "next/server";
import { Resend } from "resend";
import { type ContactPayload, validateContactInput } from "@/lib/contact";

export const runtime = "nodejs";
export const maxDuration = 30;

const INTEREST_LABELS: Record<string, string> = {
  supply_chain_esg: "Supply Chain ESG",
  insurance_risk: "Insurance Risk Pricing",
  investment_screening: "Investment Screening",
  strategic_partnership: "Strategic Partnership",
};

function interestLabel(value: string): string {
  const v = value.trim();
  if (!v) return "(미선택)";
  return INTEREST_LABELS[v] ?? v;
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL?.trim();
  const from = process.env.CONTACT_FROM_EMAIL?.trim() || "OrbitAlpha <onboarding@resend.dev>";

  if (!apiKey || !to) {
    return NextResponse.json(
      { ok: false, error: "server_config" },
      { status: 503 },
    );
  }

  let body: Partial<ContactPayload>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const payload: Partial<ContactPayload> = {
    companyName: typeof body.companyName === "string" ? body.companyName : "",
    contactName: typeof body.contactName === "string" ? body.contactName : "",
    email: typeof body.email === "string" ? body.email : "",
    interest: typeof body.interest === "string" ? body.interest : "",
    message: typeof body.message === "string" ? body.message : "",
    website: typeof body.website === "string" ? body.website : "",
    formOpenTs: typeof body.formOpenTs === "number" ? body.formOpenTs : undefined,
  };

  const err = validateContactInput(payload);
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: 400 });
  }

  const companyName = payload.companyName!.trim();
  const contactName = payload.contactName!.trim();
  const email = payload.email!.trim();
  const message = payload.message!.trim();
  const interest = payload.interest?.trim() ?? "";

  const text = [
    `[OrbitAlpha 홈페이지 문의]`,
    ``,
    `회사명: ${companyName}`,
    `담당자: ${contactName}`,
    `이메일: ${email}`,
    `관심 분야: ${interestLabel(interest)}`,
    ``,
    `--- 문의 내용 ---`,
    message,
    ``,
    `---`,
    `수신 시각(서버): ${new Date().toISOString()}`,
  ].join("\n");

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      replyTo: email,
      subject: `[OrbitAlpha 문의] ${companyName} · ${contactName}`,
      text,
    });

    if (error) {
      console.error("[contact]", error);
      return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e) {
    console.error("[contact]", e);
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
  }
}
