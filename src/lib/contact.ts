/** Contact API 공유 검증 (서버·클라이언트 힌트용) */

export const CONTACT_MESSAGE_MIN_LENGTH = 20;
export const CONTACT_FORM_MIN_MS = 2500;

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function isValidEmail(email: string): boolean {
  const s = email.trim();
  if (s.length > 254) return false;
  return EMAIL_RE.test(s);
}

export type ContactPayload = {
  companyName: string;
  contactName: string;
  email: string;
  interest: string;
  message: string;
  /** honeypot — 반드시 비어 있어야 함 */
  website?: string;
  /** 폼이 열린 시각(ms). 서버에서 최소 체류 시간 검사 */
  formOpenTs?: number;
};

export type ContactValidationError =
  | "required"
  | "email"
  | "message_short"
  | "honeypot"
  | "too_fast";

export function validateContactInput(p: Partial<ContactPayload>): ContactValidationError | null {
  const companyName = (p.companyName ?? "").trim();
  const contactName = (p.contactName ?? "").trim();
  const email = (p.email ?? "").trim();
  const message = (p.message ?? "").trim();

  if (!companyName || !contactName || !email || !message) return "required";
  if (p.website != null && String(p.website).trim() !== "") return "honeypot";
  if (!isValidEmail(email)) return "email";
  if (message.length < CONTACT_MESSAGE_MIN_LENGTH) return "message_short";

  const ts = typeof p.formOpenTs === "number" ? p.formOpenTs : 0;
  if (ts > 0 && Date.now() - ts < CONTACT_FORM_MIN_MS) return "too_fast";

  return null;
}
