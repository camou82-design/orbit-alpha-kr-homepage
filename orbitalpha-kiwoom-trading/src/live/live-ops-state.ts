import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const LIVE_OPS_STATE_SCHEMA = 1 as const;

/**
 * 엔진이 monitor-status와 동일 시점에 기록하는 스냅샷 (모니터 UI가 monitor 파일 없이도 판단 가능).
 * `killSwitchActive` 등 운영 필드는 루트에 유지.
 */
export interface LiveOpsEngineMirror {
  updatedAt: string;
  liveTradingEnabled?: boolean;
  liveConfirmationRequired?: boolean;
  effectiveSessionPhase?: string;
  forcedSessionPhase?: boolean;
  /** 테스트 실주문 1회 경로 기준 허용 여부 (자동 루프는 false·미설정 가능) */
  realOrderEligible?: boolean;
  /** LIVE_TRADING_ENABLED (전략 실주문 게이트) */
  liveStrategyGate?: boolean;
  /** 전략 dry-run 등 차단 코드 */
  blockReasons?: string[];
  /** liveTestOrderBlockReasons */
  testBlockReasons?: string[];
}

/**
 * 배너 fallback 및 `syncEngineMirrorToLiveOpsState`가 기록하는 `realOrderEligible`와 동일 규칙.
 * `liveStrategyGate`가 생략된 구버전 스냅샷은 `liveTradingEnabled === true`로 간주.
 */
export function inferRealOrderEligibleFromEngineMirror(
  m: Omit<LiveOpsEngineMirror, "updatedAt">
): boolean {
  const blockReasons = m.blockReasons ?? [];
  const testBlockReasons = m.testBlockReasons ?? [];

  const noBlocks = blockReasons.length === 0 && testBlockReasons.length === 0;

  const gateOk =
    m.liveStrategyGate === true ||
    (m.liveStrategyGate === undefined && m.liveTradingEnabled === true);

  return (
    m.liveTradingEnabled === true &&
    m.liveConfirmationRequired === false &&
    m.effectiveSessionPhase === "REGULAR" &&
    gateOk &&
    noBlocks
  );
}

/** `syncEngineMirrorToLiveOpsState` 입력 — `realOrderEligible`는 항상 infer로만 기록 */
export type EngineMirrorSyncPatch = Omit<LiveOpsEngineMirror, "updatedAt" | "realOrderEligible">;

export interface LiveOpsStateFile {
  schemaVersion: typeof LIVE_OPS_STATE_SCHEMA;
  updatedAt: string;
  /** KST 영업일 기준 (YYYY-MM-DD) — 일일 필드 롤오버에 사용 */
  tradingDay: string;
  killSwitchActive: boolean;
  killSwitchActivatedAt?: string;
  killSwitchActivatedBy?: string;
  killSwitchClearedAt?: string;
  killSwitchClearedBy?: string;
  /** recordOrderAttempt 기준 당일 누적 (브로커 호출 직전에 증가) */
  ordersTodayCount: number;
  lastOrderAttemptAt?: string;
  lastOrderSuccessAt?: string;
  lastOrderFailureAt?: string;
  /** 청산(매도 성공) 시각 — 재진입 쿨다운용 */
  symbolLastFlatAt: Record<string, string>;
  /** 당일 실현 손익 누적 (원) */
  dailyRealizedPnlKrw: number;
  /** 손실 한도 초과로 매수만 정지 */
  lossHaltActive: boolean;
  lossHaltReasonKo?: string;
  /** 엔진 마지막 동기화 스냅샷 (monitor-status 미수신·구버전 대비) */
  engineMirror?: LiveOpsEngineMirror;
}

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ ?? "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function defaultFilePath(): string {
  const raw = process.env.LIVE_OPS_STATE_FILE?.trim();
  if (raw && raw.length > 0) {
    return isAbsolute(raw) ? resolve(raw) : resolve(process.cwd(), raw);
  }
  const root = process.env.KIWOOM_PROJECT_ROOT?.trim();
  if (root && root.length > 0) {
    const r = isAbsolute(root) ? resolve(root) : resolve(process.cwd(), root);
    return join(r, "data", "live-ops-state.json");
  }
  return join(process.cwd(), "data", "live-ops-state.json");
}

export function getLiveOpsStatePath(): string {
  return defaultFilePath();
}

function emptyStateForDay(day: string, carryKillFrom?: LiveOpsStateFile): LiveOpsStateFile {
  const k = Boolean(carryKillFrom?.killSwitchActive);
  return {
    schemaVersion: LIVE_OPS_STATE_SCHEMA,
    updatedAt: new Date().toISOString(),
    tradingDay: day,
    killSwitchActive: k,
    killSwitchActivatedAt: k ? carryKillFrom?.killSwitchActivatedAt : undefined,
    killSwitchActivatedBy: k ? carryKillFrom?.killSwitchActivatedBy : undefined,
    killSwitchClearedAt: undefined,
    killSwitchClearedBy: undefined,
    ordersTodayCount: 0,
    lastOrderAttemptAt: undefined,
    lastOrderSuccessAt: undefined,
    lastOrderFailureAt: undefined,
    symbolLastFlatAt: {},
    dailyRealizedPnlKrw: 0,
    lossHaltActive: false,
    lossHaltReasonKo: undefined,
    engineMirror: undefined,
  };
}

function rolloverIfNeeded(raw: LiveOpsStateFile): LiveOpsStateFile {
  const d = todayKst();
  if (raw.tradingDay === d) return raw;
  return emptyStateForDay(d, raw.killSwitchActive ? raw : undefined);
}

export function readLiveOpsState(): LiveOpsStateFile {
  const path = defaultFilePath();
  try {
    if (!existsSync(path)) {
      const st = emptyStateForDay(todayKst(), undefined);
      writeLiveOpsState(st);
      return st;
    }
    const t = readFileSync(path, "utf8");
    const j = JSON.parse(t) as LiveOpsStateFile;
    if (j.schemaVersion !== LIVE_OPS_STATE_SCHEMA || typeof j.tradingDay !== "string") {
      const st = emptyStateForDay(todayKst(), undefined);
      writeLiveOpsState(st);
      return st;
    }
    const rolled = rolloverIfNeeded({
      ...j,
      symbolLastFlatAt: j.symbolLastFlatAt ?? {},
      ordersTodayCount: Math.max(0, Math.floor(Number(j.ordersTodayCount) || 0)),
      dailyRealizedPnlKrw: Number.isFinite(j.dailyRealizedPnlKrw)
        ? j.dailyRealizedPnlKrw
        : 0,
      killSwitchActive: Boolean(j.killSwitchActive),
      lossHaltActive: Boolean(j.lossHaltActive),
      engineMirror:
        j.engineMirror && typeof j.engineMirror === "object"
          ? (j.engineMirror as LiveOpsEngineMirror)
          : undefined,
    });
    if (rolled.tradingDay !== j.tradingDay) {
      writeLiveOpsState(rolled);
    }
    return rolled;
  } catch {
    const st = emptyStateForDay(todayKst(), undefined);
    try {
      writeLiveOpsState(st);
    } catch {
      /* empty */
    }
    return st;
  }
}

export function writeLiveOpsState(state: LiveOpsStateFile): void {
  const path = defaultFilePath();
  mkdirSync(dirname(path), { recursive: true });
  const next = { ...state, updatedAt: new Date().toISOString() };
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, path);
}

/** 엔진이 monitor-status와 같은 값으로 갱신 — 모니터가 구버전 JSON만 읽어도 판단 가능. */
export function syncEngineMirrorToLiveOpsState(engineMirrorPatch: EngineMirrorSyncPatch): LiveOpsStateFile {
  const realOrderEligible = inferRealOrderEligibleFromEngineMirror(engineMirrorPatch);
  const s = mutateLiveOpsState((st) => {
    st.engineMirror = {
      ...engineMirrorPatch,
      realOrderEligible,
      updatedAt: new Date().toISOString(),
    };
  });
  console.info("[live-ops-state] engineMirror synced", {
    updatedAt: s.engineMirror?.updatedAt,
    liveTradingEnabled: s.engineMirror?.liveTradingEnabled,
    effectiveSessionPhase: s.engineMirror?.effectiveSessionPhase,
    realOrderEligible: s.engineMirror?.realOrderEligible,
  });
  return s;
}

export function mutateLiveOpsState(mutator: (s: LiveOpsStateFile) => void): LiveOpsStateFile {
  const s = readLiveOpsState();
  mutator(s);
  writeLiveOpsState(s);
  return s;
}

export function recordSymbolFlat(symbol: string, iso = new Date().toISOString()): void {
  const sym = symbol.trim();
  if (!sym) return;
  mutateLiveOpsState((s) => {
    s.symbolLastFlatAt[sym] = iso;
  });
}

export function syncDailyRealizedPnlKrw(pnl: number): LiveOpsStateFile {
  return mutateLiveOpsState((s) => {
    s.dailyRealizedPnlKrw = pnl;
  });
}

export function setKillSwitchActive(active: boolean, username: string): LiveOpsStateFile {
  return mutateLiveOpsState((s) => {
    const u = username.trim() || "unknown";
    if (active) {
      s.killSwitchActive = true;
      s.killSwitchActivatedAt = new Date().toISOString();
      s.killSwitchActivatedBy = u;
    } else {
      s.killSwitchActive = false;
      s.killSwitchClearedAt = new Date().toISOString();
      s.killSwitchClearedBy = u;
    }
  });
}

/** 브로커 POST 직전 호출 — 일일 횟수 +1 */
export function recordOrderAttempt(iso = new Date().toISOString()): void {
  mutateLiveOpsState((s) => {
    s.lastOrderAttemptAt = iso;
    s.ordersTodayCount = (s.ordersTodayCount ?? 0) + 1;
  });
}

export function recordOrderBrokerResult(input: {
  ok: boolean;
  accepted: boolean;
  iso?: string;
}): void {
  const iso = input.iso ?? new Date().toISOString();
  mutateLiveOpsState((s) => {
    if (input.ok && input.accepted) {
      s.lastOrderSuccessAt = iso;
    } else {
      s.lastOrderFailureAt = iso;
    }
  });
}

export function applyLossHaltIfNeeded(liveMaxDailyLossKrw: number): LiveOpsStateFile {
  return mutateLiveOpsState((s) => {
    const limit = Math.max(0, liveMaxDailyLossKrw);
    if (limit <= 0) return;
    if (s.dailyRealizedPnlKrw <= -limit) {
      s.lossHaltActive = true;
      s.lossHaltReasonKo = `당일 실현 손익이 손실 한도(${limit.toLocaleString("ko-KR")}원)를 넘어 신규 매수가 정지되었습니다`;
    }
  });
}
