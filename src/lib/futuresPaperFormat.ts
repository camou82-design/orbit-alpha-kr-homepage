/**
 * Display-only helpers for /futures-paper (no API / data shape changes).
 */

const KST_TZ = "Asia/Seoul";

/** True when value is "empty" for display (not including valid numeric 0). */
export function isDisplayEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (typeof value === "number" && !Number.isFinite(value)) return true;
  return false;
}

/** Missing data vs valid zero: 0 shows as "0". */
export function formatEmpty(value: unknown, emptyLabel = "데이터 없음"): string {
  if (isDisplayEmpty(value)) return emptyLabel;
  if (typeof value === "number" && value === 0) return "0";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return String(value);
}

/** Integer-like counts (trades): 0 is valid. */
export function formatCount(value: unknown, emptyLabel = "데이터 없음"): string {
  if (value === null || value === undefined) return emptyLabel;
  if (typeof value === "number" && !Number.isFinite(value)) return emptyLabel;
  if (typeof value === "number" && Number.isInteger(value)) return value.toLocaleString("ko-KR");
  if (typeof value === "number") return Math.trunc(value).toLocaleString("ko-KR");
  const n = Number(value);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return emptyLabel;
}

/** USD 손익/금액: 천단위, 소수 최대 4자리. */
export function formatCurrencyUsd(value: unknown, emptyLabel = "데이터 없음"): string {
  if (isDisplayEmpty(value)) return emptyLabel;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return emptyLabel;
  const abs = Math.abs(n);
  const maxFrac = abs >= 1000 ? 2 : abs >= 1 ? 3 : 4;
  return `$${n.toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: maxFrac })}`;
}

/**
 * 승률: 0~1 비율 → 퍼센트. 이미 0~100 형태면 그대로 %만 붙임(휴리스틱).
 */
export function formatPercent(value: unknown, emptyLabel = "데이터 없음"): string {
  if (isDisplayEmpty(value)) return emptyLabel;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return emptyLabel;
  let pct = n;
  if (n >= 0 && n <= 1) pct = n * 100;
  else if (n > 1 && n <= 100) pct = n;
  else if (n > 100) pct = n;
  return `${pct.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
}

/** 펀딩 등 작은 비율(원시 rate) 표시용 */
export function formatRateRaw(value: unknown, emptyLabel = "데이터 없음"): string {
  if (isDisplayEmpty(value)) return emptyLabel;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return emptyLabel;
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 6 });
}

/** 가격 등 큰 숫자 */
export function formatPrice(value: unknown, emptyLabel = "데이터 없음"): string {
  if (isDisplayEmpty(value)) return emptyLabel;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return emptyLabel;
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

/** KST, `YYYY-MM-DD HH:mm:ss` 형태 (sv-SE + timeZone). */
export function formatDateTimeKst(ms: unknown, emptyLabel = "데이터 없음"): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return emptyLabel;
  try {
    const s = new Date(ms).toLocaleString("sv-SE", { timeZone: KST_TZ });
    return `${s.replace("T", " ")} KST`;
  } catch {
    return emptyLabel;
  }
}

const STATUS_LABELS: Record<string, string> = {
  healthy: "정상",
  weak: "약세",
  cold: "최근 거래 없음",
  "insufficient-data": "표본 부족"
};

export function mapStatusLabel(status: unknown): string {
  if (typeof status !== "string" || !status) return "데이터 없음";
  return STATUS_LABELS[status] ?? status;
}

const REASON_LABELS: Record<string, string> = {
  last7d_pnl_negative: "최근 7일 손익 부진",
  last30d_win_rate_low: "최근 30일 승률 낮음",
  fee_drag_high: "수수료 부담 높음",
  funding_drag_high: "펀딩 부담 높음",
  trade_count_too_small: "거래 수 부족",
  no_recent_trades: "최근 거래 없음"
};

export function mapReasonLabel(key: string): string {
  return REASON_LABELS[key] ?? key;
}

const SIGNAL_LABELS: Record<string, string> = {
  paper_long_candidate: "롱 진입 후보",
  none: "중립",
  neutral: "중립",
  strong: "강세"
};

export function mapSignalLabel(signal: unknown): string {
  if (typeof signal !== "string" || !signal) return "데이터 없음";
  return SIGNAL_LABELS[signal] ?? signal;
}

export function formatTrendOk(value: unknown): string {
  if (value === true) return "조건 충족";
  if (value === false) return "조건 미충족";
  return formatEmpty(value);
}

export function formatChanged(value: unknown): string {
  if (value === true) return "이전 대비 변경됨";
  if (value === false) return "변경 없음";
  return formatEmpty(value);
}
