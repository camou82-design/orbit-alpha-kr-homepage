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
  "insufficient-data": "표본 부족",
  open: "진입 중"
};

export function mapStatusLabel(status: unknown): string {
  if (typeof status !== "string" || !status) return "데이터 없음";
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
  if (typeof signal !== "string" || !signal) return "데이터 없음";
  const s = signal.toLowerCase();
  if (s === "none" || s === "") return "관망 중";
  if (s === "paper_long_candidate") return "상승 후보 감지";
  if (s === "paper_short_candidate") return "하락 후보 감지";
  if (s === "neutral") return "중립";
  if (s === "strong") return "강세";
  return SIGNAL_LABELS[signal] ?? signal;
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
 * [NEW] 종합 상태 해석 (카드 1 전용)
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
