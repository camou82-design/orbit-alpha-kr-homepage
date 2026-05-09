/**
 * Display-only helpers for /futures-paper (no API / data shape changes).
 */

const KST_TZ = "Asia/Seoul";

/** V2 무진입 감사 `ts`(심별) staleness 기준(ms). */
export const NO_ENTRY_AUDIT_STALE_MS = 180_000;

/** `YYYY-MM-DD HH:mm:ss KST` (표시 규격; 브라우저 `Asia/Seoul` 기준). */
export function formatDateTimeKstNumeric(ms: unknown, emptyLabel = "기록 없음"): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return emptyLabel;
  try {
    const s = new Date(ms).toLocaleString("sv-SE", { timeZone: KST_TZ });
    return `${s} KST`;
  } catch {
    return emptyLabel;
  }
}

/** `HH:mm:ss KST`. */
export function formatTimeHmssKst(ms: unknown, emptyLabel = "—"): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return emptyLabel;
  try {
    const t = new Date(ms).toLocaleTimeString("sv-SE", {
      timeZone: KST_TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    return `${t} KST`;
  } catch {
    return emptyLabel;
  }
}

/**
 * 경과 시간 한글 표기 (양수 ms 기준).
 * 90초 미만은 초, 그 외 분(120분까지), 그 이상 시간 혼합.
 */
export function formatRelativeAgeKo(ageMs: number, emptyLabel = "—"): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return emptyLabel;
  const sec = Math.floor(ageMs / 1000);
  if (sec < 90) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 120) return `${min}분 전`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}시간 ${m}분 전`;
}

export type NoEntryAuditSnapshotRow = Readonly<
  Record<string, unknown> & {
    ts?: number;
    symbol?: string;
    expected_missing_condition?: unknown;
    expected_next_action?: unknown;
    side_veto_detail?: unknown;
  }
>;

export function pickNoEntryAuditRow(bundle: Record<string, unknown> | null | undefined, sym: string): NoEntryAuditSnapshotRow | null {
  const rawBy =
    (bundle?.noEntryAuditBySymbol as Record<string, unknown> | undefined | null) ??
    (bundle?.noEntryAudit &&
      typeof bundle.noEntryAudit === "object" &&
      !Array.isArray(bundle.noEntryAudit) &&
      (bundle.noEntryAudit as Record<string, unknown>).bySymbol &&
      typeof (bundle.noEntryAudit as Record<string, unknown>).bySymbol === "object"
      ? ((bundle.noEntryAudit as Record<string, unknown>).bySymbol as Record<string, unknown>)
      : null);
  if (!rawBy || typeof rawBy !== "object") return null;
  const u = sym.trim().toUpperCase();
  const row = rawBy[sym] ?? rawBy[u];
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  return row as NoEntryAuditSnapshotRow;
}

export function noEntryJudgmentTsMs(row: NoEntryAuditSnapshotRow | null): number | null {
  const t = row?.ts;
  return typeof t === "number" && Number.isFinite(t) ? t : null;
}

export function isStaleNoEntryAudit(ts: unknown, clientNowMs: number): boolean {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return true;
  return clientNowMs - ts >= NO_ENTRY_AUDIT_STALE_MS;
}

/** 심별 `ts` 기준 최신 V2 무진입 타임스탬프 하나로 요약할 때 사용. */
export function maxSymbolAuditTs(bundle: Record<string, unknown> | null | undefined, symbols: readonly string[]): number | null {
  let mx: number | null = null;
  for (const sym of symbols) {
    const r = pickNoEntryAuditRow(bundle, sym);
    const t = noEntryJudgmentTsMs(r);
    if (t !== null && (mx === null || t > mx)) mx = t;
  }
  return mx;
}

const NO_ENTRY_EXPECTED_MISSING_KO: Record<string, string> = {
  SHOCK_REACTION_WATCH_MID_CHASE_BLOCKED: "상승/하락 충격 후 중간 구간 추격 진입 차단",
  SHOCK_UP_RECLAIM_NOT_CONFIRMED: "상승 재돌파 후 지지 재확인 미완료",
  SHOCK_UP_MID_RETEST_REQUIRED: "상승 충격 후 중간 구간 리테스트 대기",
  SHOCK_DOWN_BREAKDOWN_RETEST_NOT_CONFIRMED: "하락 이탈 후 리테스트 실패 확인 미완료",
  MIN_QUALITY_NOT_MET: "진입 품질 점수 부족",
  TREND_ENTRY_NOT_PROMOTED: "추세 후보는 있으나 V2 승격 조건 미충족",
  SIDE_NONE_AFTER_VETO: "후처리 후 유효 방향 없음",
  TREND_CANDIDATE_NOT_PROMOTED_DETAIL: "추세 후보는 있으나 진입 확정 조건 부족",
  TREND_PROMOTION_MISSING_RETEST: "추세 후보는 있으나 리테스트 확인 부족",
  TREND_PROMOTION_MISSING_PULLBACK_CONFIRM: "추세 후보는 있으나 눌림 지지 확인 부족",
  TREND_PROMOTION_MISSING_VOLUME_CONFIRM: "추세 후보는 있으나 거래량 확인 부족",
  TREND_PROMOTION_HTF_CONFLICT: "추세 후보는 있으나 상위봉 방향 충돌",
  TREND_PROMOTION_QUALITY_WEAK: "추세 후보 품질 부족",
  TREND_PROMOTION_ZONE_UNFAVORABLE: "현재 가격 구간이 진입에 불리함",
  TREND_PROMOTION_EXPECTED_MOVE_TOO_SMALL: "기대 수익폭 부족",
  TREND_PROMOTION_STOP_PLAN_MISSING: "손절 계획 미확정",
  TREND_PROMOTION_PROFIT_LOSS_DISTANCE_BAD: "손익 거리 비율 불리",
  TREND_PROMOTION_WAIT_RECHECK: "다음 캔들 재확인 대기"
};

const NO_ENTRY_NEXT_ACTION_KO: Record<string, string> = {
  WAIT_FOR_RETEST_OR_RECLAIM_CONFIRMATION: "리테스트 / 지지 재확인 대기",
  WAIT_FOR_BREAKDOWN_RETEST_FAILURE: "하락 이탈 리테스트 결과 대기",
  WAIT_FOR_VALID_SIDE_CONFIRMATION: "유효 방향 재확인 대기",
  WAIT_FOR_RECOVERY_MODE_CLEAR_OR_HIGH_CONFIDENCE_RETEST: "복구 모드 해제 또는 고신뢰 리테스트 대기",
  WAIT_FOR_VALID_ENTRY_SIGNAL: "진입 신호 재확인 대기",
  WAIT_FOR_TREND_CONFIRMATION: "추세 재확인 대기",
  WAIT_FOR_RANGE_TREND_ALIGNMENT: "레인지·추세 정렬 재확인 대기",
  WAIT_FOR_PROMOTION_CONFIRMATION: "V2 승격 조건 재확인 대기",
  WAIT_FOR_HTF_ALIGNMENT: "상위봉 정렬 대기"
};

/** 엔진 내부 토큰(SCREAMING_SNAKE) 여부 — 본문에 raw로 노출하지 않음. */
function looksLikeEngineCodeToken(s: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(s.trim());
}

/**
 * 운영 카드 본문용: 매핑된 한글만. 미매핑 내부 코드는 일반 문구로 대체( raw는 `noEntryExpectedMissingRawForDetail` ).
 */
export function mapNoEntryExpectedMissing(code: unknown): string {
  if (code === null || code === undefined || code === "") return "—";
  const k = String(code).trim();
  if (!k) return "—";
  const mapped = NO_ENTRY_EXPECTED_MISSING_KO[k];
  if (mapped) return mapped;
  if (looksLikeEngineCodeToken(k)) return "무진입 사유(내부 코드·아래 보조 참조)";
  return k;
}

/** 보조 텍스트(작은 monospace). 매핑된 코드는 null. */
export function noEntryExpectedMissingRawForDetail(code: unknown): string | null {
  if (code === null || code === undefined || code === "") return null;
  const k = String(code).trim();
  if (!k) return null;
  if (NO_ENTRY_EXPECTED_MISSING_KO[k]) return null;
  if (looksLikeEngineCodeToken(k)) return k;
  return null;
}

export function mapNoEntryNextAction(code: unknown): string {
  if (code === null || code === undefined || code === "") return "—";
  const k = String(code).trim();
  if (!k) return "—";
  const mapped = NO_ENTRY_NEXT_ACTION_KO[k];
  if (mapped) return mapped;
  if (looksLikeEngineCodeToken(k)) return "다음 대기(내부 코드·아래 보조 참조)";
  return k;
}

export function noEntryNextActionRawForDetail(code: unknown): string | null {
  if (code === null || code === undefined || code === "") return null;
  const k = String(code).trim();
  if (!k) return null;
  if (NO_ENTRY_NEXT_ACTION_KO[k]) return null;
  if (looksLikeEngineCodeToken(k)) return k;
  return null;
}

const HTF_ENTRY_POLICY_KO: Record<string, string> = {
  PROBE_ONLY: "소형 진입만 허용 가능",
  ALLOW_WITH_MACRO_RISK: "상위봉 위험 있음, 조건 충족 시 제한 진입 가능",
  ALLOW: "상위봉 정렬 양호",
  HOLD: "상위봉 정렬 대기",
  WAIT_FOR_HTF_ALIGNMENT: "상위봉 정렬 대기",
  HTF_POLICY_BLOCK: "상위봉 방향 충돌로 진입 차단"
};

export function mapHtfEntryPolicy(code: unknown): string {
  if (code === null || code === undefined || code === "") return "—";
  const k = String(code).trim();
  return HTF_ENTRY_POLICY_KO[k] ?? (looksLikeEngineCodeToken(k) ? "HTF 정책(내부 코드)" : k);
}

export function htfEntryPolicyRawForDetail(code: unknown): string | null {
  if (code === null || code === undefined || code === "") return null;
  const k = String(code).trim();
  if (!k) return null;
  if (HTF_ENTRY_POLICY_KO[k]) return null;
  if (looksLikeEngineCodeToken(k)) return k;
  return null;
}

const MACRO_SOURCE_KO: Record<string, string> = {
  actual_candles: "실제 캔들 기반",
  partial_actual_candles: "일부 실제 캔들 기반",
  market_subtype_proxy: "장세 프록시 기반"
};

export function mapMacroSourceDisplay(code: unknown): string {
  if (code === null || code === undefined || code === "") return "—";
  const k = String(code).trim();
  return MACRO_SOURCE_KO[k] ?? k;
}

export function formatHtfBiasField(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "예" : "아니오";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const s = String(v).trim();
  return s.length > 0 ? s : "—";
}

export function formatHtfSizeMultiplier(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "—";
}

/** 감사 스냅샷에 HTF 관련 키가 하나라도 있으면 true */
export function noEntryRowHasHtf(row: Record<string, unknown> | null | undefined): boolean {
  if (!row || typeof row !== "object") return false;
  const keys = [
    "htf_entry_policy",
    "counter_trend_risk",
    "htf_size_multiplier",
    "htf_requires_stronger_confirmation",
    "htf_hard_block_reason",
    "macro_source",
    "htf_5m_bias",
    "htf_15m_bias",
    "htf_1h_bias",
    "htf_4h_bias",
    "htf_1d_bias"
  ] as const;
  return keys.some((k) => row[k] !== null && row[k] !== undefined && row[k] !== "");
}

export function formatSideCandidateEn(x: unknown): string {
  if (x === "long") return "Long";
  if (x === "short") return "Short";
  if (x === null || x === undefined || String(x).toLowerCase() === "none") return "none";
  return String(x);
}

export function formatBoolKo(v: unknown): string {
  if (v === true) return "예";
  if (v === false) return "아니오";
  return "—";
}

/** True when value is "empty" for display (not including valid numeric 0). */
export function isDisplayEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (typeof value === "number" && !Number.isFinite(value)) return true;
  return false;
}

/** Missing data vs valid zero: 0 shows as "0". */
export function formatEmpty(value: unknown, emptyLabel = "기록 없음"): string {
  if (isDisplayEmpty(value)) return emptyLabel;
  if (typeof value === "number" && value === 0) return "0";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return String(value);
}

/** Integer-like counts (trades): 0 is valid. */
export function formatCount(value: unknown, emptyLabel = "기록 없음"): string {
  if (value === null || value === undefined) return emptyLabel;
  if (typeof value === "number" && !Number.isFinite(value)) return emptyLabel;
  if (typeof value === "number" && Number.isInteger(value)) return value.toLocaleString("ko-KR");
  if (typeof value === "number") return Math.trunc(value).toLocaleString("ko-KR");
  const n = Number(value);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return emptyLabel;
}

/** USD 손익/금액: 천단위, 소수 최대 4자리. */
export function formatCurrencyUsd(value: unknown, emptyLabel = "기록 없음"): string {
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
export function formatPercent(value: unknown, emptyLabel = "기록 없음"): string {
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
export function formatRateRaw(value: unknown, emptyLabel = "기록 없음"): string {
  if (isDisplayEmpty(value)) return emptyLabel;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return emptyLabel;
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 6 });
}

/** 가격 등 큰 숫자 */
export function formatPrice(value: unknown, emptyLabel = "기록 없음"): string {
  if (isDisplayEmpty(value)) return emptyLabel;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return emptyLabel;
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

/** KST, `YYYY-MM-DD HH:mm:ss` 형태 (sv-SE + timeZone). */
export function formatDateTimeKst(ms: unknown, emptyLabel = "기록 없음"): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return emptyLabel;
  try {
    const parts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: KST_TZ,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(new Date(ms));
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}년 ${get("month")}월 ${get("day")}일 ${get("hour")}시 ${get("minute")}분 ${get("second")}초 KST`;
  } catch {
    return emptyLabel;
  }
}

export function formatDateTimeKstShort(ms: unknown, emptyLabel = "기록 없음"): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return emptyLabel;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: KST_TZ,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(new Date(ms));
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")} KST`;
  } catch {
    return emptyLabel;
  }
}

const STATUS_LABELS: Record<string, string> = {
  "insufficient-data": "표본 부족",
  open: "진입 중"
};

export function mapStatusLabel(status: unknown): string {
  if (typeof status !== "string" || !status) return "기록 없음";
  const s = status.toUpperCase();
  if (s === "RUNNING") return "정상 실행 중";
  if (s === "PAUSED") return "일시 정지(리스크)";
  if (s === "DISABLED") return "진입 비활성화";
  if (s === "IDLE") return "진입 신호 대기";
  if (s === "BLOCKED") return "진입 보류";
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
  if (key.startsWith("EXIT_") || key.includes("_EXIT")) {
    const { label, desc } = formatExitReason(key);
    return `${label}: ${desc}`;
  }
  if (key === "low_expected_move") return "움직임이 작아 수익 여지가 부족함";
  if (key === "no_trade_regime") return "시장 방향이 뚜렷하지 않아 관망 중";
  if (key === "insufficient_data" || key.includes("insufficient_")) return "판단에 필요한 최근 데이터가 아직 부족함";
  if (key === "high_risk_status") return "시장 위험도가 높아 진입 보류 중";
  if (key === "daily_loss_limit") return "일간 손실 한도 도달로 정지";
  if (key === "regime_mismatch") return "전략 레짐과 현재 시장 상황 불일치";
  if (key === "quality_score_low") return "신호 품질이 기준치 미달";
  if (key === "EDGE_FAIL_FEE") return "수수료 대비 기대 수익 부족";
  if (key === "AI_REJECT") return "AI 판단 거절";
  if (key === "RISK_LOCK") return "리스크 상한 도달";
  if (key.includes("crash_risk_")) return `급락 방어 개입 (${key.replace("crash_risk_", "").toUpperCase()})`;
  return REASON_LABELS[key] ?? key;
}

const SIGNAL_LABELS: Record<string, string> = {
  paper_long_candidate: "상승 후보 감지",
  paper_short_candidate: "하락 후보 감지",
  none: "진입 없음",
  neutral: "중립",
  strong: "강세"
};

export function mapSignalLabel(signal: unknown): string {
  if (typeof signal !== "string" || !signal) return "기록 없음";
  const s = signal.toLowerCase();
  if (s === "none" || s === "") return "관망 중";
  if (s === "paper_long_candidate") return "상승 후보 감지";
  if (s === "paper_short_candidate") return "하락 후보 감지";
  if (s === "neutral") return "중립";
  if (s === "strong") return "강세";
  return SIGNAL_LABELS[signal] ?? signal;
}

/** [NEW] 종료 사유 코드별 표시명 및 설명 사전 */
const EXIT_REASON_MAP: Record<string, { label: string; desc: string }> = {
  EXIT_SL: { label: "손절", desc: "손실 제한 조건에 도달해 종료했습니다." },
  EXIT_TP: { label: "목표 수익 도달", desc: "목표 수익 조건을 충족해 종료했습니다." },
  EXIT_TP_1: { label: "1차 익절", desc: "1차 수익 목표 도달 및 비중 축소" },
  EXIT_TP_2: { label: "2차 익절", desc: "2차 수익 목표 도달 및 비중 축소" },
  EXIT_PARTIAL_TP: { label: "부분 익절", desc: "수익 분할 확보 완료" },
  EXIT_TP_PARTIAL: { label: "부분 익절", desc: "수익 분할 확보 완료" },
  EXIT_TRAILING: { label: "트레일링 익절", desc: "수익 보존을 위한 트레일링 스탑 도달" },
  EXIT_TIME: { label: "시간 종료", desc: "최대 보유 시간 초과" },
  EXIT_TIME_STOP: { label: "시간 종료", desc: "최대 보유 시간 초과" },
  EXIT_TREND_BREAK: { label: "추세 이탈", desc: "추세 유지 조건이 깨져 포지션을 종료했습니다." },
  EXIT_REGIME: { label: "장세 전환", desc: "시장 상태가 바뀌어 기존 포지션을 정리했습니다." },
  EXIT_REGIME_EXIT: { label: "장세 전환", desc: "시장 상태가 바뀌어 기존 포지션을 정리했습니다." },
  EXIT_REGIME_BREAK: { label: "장세 전환 종료", desc: "구조적 시장 상태 변화 감지" },
  EXIT_RANGE_REBALANCE: { label: "박스권 재조정", desc: "박스권 위치가 바뀌어 포지션을 정리했습니다." },
  EXIT_STRUCTURAL: { label: "구조 훼손 종료", desc: "시장 구조 훼손(박스 이탈 등)으로 인한 종료" },
  EXIT_RISK: { label: "위험관리 종료", desc: "변동성 또는 리스크 조건에 따라 포지션을 종료했습니다." },
  EXIT_SWITCH: { label: "전략 전환 종료", desc: "반대 신호 발생으로 인한 포지션 스위칭" },
  EXIT_TREND_SWITCH: { label: "전략 전환 종료", desc: "추세 반전 판단에 따른 스위칭" },
  EXIT_SIGNAL_LOST: { label: "진입 근거 약화", desc: "진입 당시 신호가 약해져 포지션을 정리했습니다." },
  EXIT_CRASH_FORCE: { label: "급락 강제 청산", desc: "시장 급락 감지로 인한 안전 선제 청산" },
  EXIT_CRASH_REDUCE: { label: "급락 비중 축소", desc: "하락 압력 가중으로 인한 포지션 50% 축소" },
  EXIT_LONG_CRASH_FORCE: { label: "급락 롱 강제 종료", desc: "롱 포지션 보호를 위한 급락 강제 청산" },
  EXIT_LONG_CRASH_REDUCE: { label: "급락 롱 비중 축소", desc: "롱 포지션 위험 관리를 위한 50% 선제 축소" },
  EXIT_SHORT_MOMENTUM_TRAIL: { label: "급락 숏 수익 보호", desc: "급락 모멘텀을 수익 기회로 활용하며 트레일링 보호" },
  EXIT_UNKNOWN: { label: "기록 부족", desc: "명확한 종료 사유 기록 없음" },
  CANDIDATE_LOST: { label: "진입 근거 약화", desc: "진입 당시 신호가 약해져 포지션을 정리했습니다." },
  RISK_EXIT: { label: "위험관리 종료", desc: "변동성 또는 리스크 조건에 따라 포지션을 종료했습니다." },
  RANGE_REBALANCE: { label: "박스권 재조정", desc: "박스권 위치가 바뀌어 포지션을 정리했습니다." },
};

/** [NEW] 종료 사유 포맷팅 */
export function formatExitReason(code: unknown): { label: string; desc: string; code: string } {
  const c = String(code || "EXIT_UNKNOWN").toUpperCase();
  const entry = EXIT_REASON_MAP[c];

  if (entry) {
    return { ...entry, code: c };
  }

  // 하위 호환 / 기타 코드 처리
  if (c.includes("TP")) return { label: "익절", desc: "목표 수익 도달", code: c };
  if (c.includes("SL")) return { label: "손절", desc: "손실 제한 도달", code: c };
  if (c.includes("TIME")) return { label: "시간 종료", desc: "보유 시간 경과", code: c };

  return { label: "종료", desc: "포지션 정리됨", code: c };
}

/**
 * 스냅샷 한 줄 기준 맥락 문구 (롱·숏·횡보 weak / 추세 strong / 진입 없음).
 * `trendOk` 단독의 “조건 충족/미충족” 대신 사용.
 */
export function describeSnapshotContext(row: Record<string, unknown>): string {
  const signal = typeof row.signal === "string" ? row.signal : "";
  const trendOk = row.trendOk === true;
  const strength =
    row.candidateStrength === "strong" || row.candidateStrength === "weak" ? row.candidateStrength : null;
  const sideways = row.sidewaysMode === true;

  if (signal === "paper_long_candidate") {
    if (sideways && strength === "weak") return "횡보 구간 · 상승 후보(약)";
    if (strength === "strong") return "추세 맥락 · 상승 후보";
    return "상승 후보 감지";
  }
  if (signal === "paper_short_candidate") {
    if (sideways && strength === "weak") return "횡보 구간 · 하락 후보(약)";
    if (strength === "strong") return "추세 맥락 · 하락 후보";
    return "하락 후보 감지";
  }
  if (signal === "none" || signal === "") {
    if (trendOk === false) return "관망 구간";
    return "관망(중립)";
  }
  return formatEmpty(row.signal);
}

/** @deprecated Prefer describeSnapshotContext — 롱 전용 레거시 표현 제거 */
export function formatTrendOk(value: unknown): string {
  if (value === true) return "방향성 확인";
  if (value === false) return "방향성 약함";
  return formatEmpty(value);
}

export function formatChanged(value: unknown): string {
  if (value === true) return "이전 대비 변경됨";
  if (value === false) return "변경 없음";
  return formatEmpty(value);
}

export function formatEntryStage(stage: unknown): string {
  if (isDisplayEmpty(stage)) return "데이터 없음";
  const s = Number(stage);
  if (s === 1) return "1단계 (선진입)";
  if (s === 2) return "2단계 (확인진입)";
  if (s === 3) return "3단계 (확정진입)";
  return `단계 ${s}`;
}

export function formatExitStage(stage: unknown): string {
  if (isDisplayEmpty(stage) || Number(stage) === 0) return "완전 보유";
  const s = Number(stage);
  if (s === 1) return "1차 익절 완료";
  if (s === 2) return "2차 익절 완료";
  return `익절 ${s}단계`;
}

/**
 * 종합 상태 해석 (카드 1 전용)
 */
export function interpretCurrentStatus(bundle: any): { label: string; sub: string } {
  const engine = bundle?.engineState;
  const status = bundle?.dashboard?.status || bundle?.summaryHealth?.status;
  const isPaused = engine?.engine_status === "PAUSED";
  const hasPosition = (bundle?.openPositions?.length ?? 0) > 0;
  const isAmbiguous = !!engine?.is_ambiguous;

  if (status === "insufficient-data") return { label: "관망 중 (데이터 부족)", sub: "판단을 위한 시장 정보가 더 필요합니다" };
  if (hasPosition) return { label: "포지션 보유 중", sub: "수익 최적화를 위해 실시간 모니터링 중입니다" };
  if (isPaused) return { label: "보수적 관망 중", sub: "리스크 제어를 위해 일시적으로 진입을 멈췄습니다" };

  const regime = engine?.current_regime;
  if (regime === "NO_TRADE") return { label: "관망 중", sub: "추세가 불분명하여 최적의 진입 시점을 기다립니다" };

  if (isAmbiguous) {
    return { label: "진입 기회 탐색 (모호)", sub: "시장 상황이 다소 애매하나 인접 레짐을 기준으로 기회를 찾는 중입니다" };
  }

  return { label: "진입 대기 중", sub: "시장 조건을 확인하며 기회를 탐색하고 있습니다" };
}

/**
 * [NEW] 성과 해석 (카드 3 전용)
 */
export function interpretPerformance(window: any): { label: string; sub: string } {
  if (!window || window.totalTrades === 0) return { label: "기록 없음", sub: "최근 체결된 거래가 없습니다" };

  const pnl = window.totalPnlUsdNet;
  const wr = window.winRate;

  if (pnl > 0) {
    if (wr >= 0.6) return { label: "호조", sub: "높은 승률과 함께 수익을 안정적으로 확보 중입니다" };
    return { label: "수익 중", sub: "일부 손실이 있지만 전체적으로는 수익 권역입니다" };
  } else {
    if (wr < 0.4) return { label: "부진", sub: "최근 승률이 낮고 손실 방어가 필요한 구간입니다" };
    return { label: "약세", sub: "승률은 유지되나 수수료/비용 부담으로 손실 중입니다" };
  }
}

/**
 * [NEW] 종목별 판단 해석
 */
export function interpretSymbolJudgment(row: any): { label: string; sub: string; probability: string } {
  const signal = row.signal || "";
  const strength = row.candidateStrength || "";

  if (signal === "paper_long_candidate" || signal === "paper_short_candidate") {
    const prob = strength === "strong" ? "높음" : "보통";
    return { label: "진입 검토 중", sub: "유효한 변동성 감지, 조건 최종 확인 중", probability: prob };
  }

  return { label: "대기", sub: "아직 진입 조건이 충분하지 않습니다", probability: "낮음" };
}
/**
 * [NEW] 자산 및 성과 계산 상수
 */
export const INITIAL_CAPITAL_KRW = 450000;
export const USDKRW_RATE = 1350;
export const INITIAL_CAPITAL_USD = INITIAL_CAPITAL_KRW / USDKRW_RATE;

/**
 * [NEW] 거래 이력 기반 자산 및 성과 통합 계산
 * Σ(pnlUsdNet)을 초기 자본에 합산하여 현재 자산을 계산합니다.
 */
export function computeLedgerPerformanceFromHistory(history: any[]) {
  const trades = Array.isArray(history) ? history : [];

  // 비용(수수료, 슬리피지, 펀딩)이 모두 반영된 pnlUsdNet 합계
  const totalRealizedPnlUsd = trades.reduce((acc, t) => {
    const net = typeof t.pnlUsdNet === 'number' ? t.pnlUsdNet : 0;
    return acc + net;
  }, 0);

  const currentCapitalUsd = INITIAL_CAPITAL_USD + totalRealizedPnlUsd;
  const currentCapitalKrw = currentCapitalUsd * USDKRW_RATE;

  const roiPct = (totalRealizedPnlUsd / INITIAL_CAPITAL_USD) * 100;

  return {
    initialCapitalUsd: INITIAL_CAPITAL_USD,
    initialCapitalKrw: INITIAL_CAPITAL_KRW,
    currentCapitalUsd,
    currentCapitalKrw,
    totalRealizedPnlUsd,
    roiPct,
    tradeCount: trades.length
  };
}
