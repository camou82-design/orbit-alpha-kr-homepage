/**
 * Live Session Guard — 장 시간대 안전장치
 *
 * 담당 규칙:
 *  1. 장 종료 N분 전 신규 진입 금지
 *  2. 장 종료 직전 강제 청산 여부 판단
 *  3. 일 손실 한도 (realized + unrealized 합산) 초과 시 신규 진입 차단
 *  4. 모든 차단 이벤트를 호출자가 JSONL로 기록할 수 있도록 이유 반환
 *
 * 설계 원칙:
 *  - 이 파일은 판단 결과만 반환, 직접 주문·청산 실행하지 않음
 *  - live-loop.ts 가 결과를 받아 행동 결정
 */

/** 한국 정규장 마감 (분 단위) = 15:30 */
const REGULAR_CLOSE_H = 15;
const REGULAR_CLOSE_M = 30;
const REGULAR_CLOSE_TOTAL_MIN = REGULAR_CLOSE_H * 60 + REGULAR_CLOSE_M;

/**
 * 현재 시각이 장 마감 기준 몇 분 전인지 반환.
 * 장 시간 외이면 null.
 */
export function minutesToSessionClose(now: Date): number | null {
    const day = now.getDay();
    if (day === 0 || day === 6) return null; // 주말

    const totalMin = now.getHours() * 60 + now.getMinutes();
    if (totalMin < 9 * 60) return null; // 장 전
    if (totalMin > REGULAR_CLOSE_TOTAL_MIN) return null; // 장 후

    return REGULAR_CLOSE_TOTAL_MIN - totalMin;
}

// -----------------------------------------------------------------
// 진입 차단 판단
// -----------------------------------------------------------------

export interface LiveEntryGateResult {
    allowed: boolean;
    reason: string | null; // null = 허용, 문자열 = 차단 사유 코드
    context?: Record<string, unknown>;
}

export interface LiveDailyLossState {
    realizedPnlKrw: number;
    unrealizedPnlKrw: number; // 보유 포지션 합산
}

/**
 * 신규 진입 허용 여부를 판단한다.
 *
 * @param now            현재 시각
 * @param noEntryMinutes 마감 N분 전부터 신규 진입 금지 (기본 15분)
 * @param dailyLoss      당일 실현+미실현 손익 상태
 * @param dailyLossLimitKrw 일 손실 한도 (절대값, KRW)
 */
export function evaluateLiveEntryGate(
    now: Date,
    opts: {
        noEntryMinutes?: number;      // default: 15
        dailyLoss: LiveDailyLossState;
        dailyLossLimitKrw: number;
        sessionPhase: string;         // "REGULAR" 이어야만 진입 가능
    }
): LiveEntryGateResult {
    const noEntryMins = opts.noEntryMinutes ?? 15;

    // [1] 정규장 세션 아님
    if (opts.sessionPhase !== "REGULAR") {
        return {
            allowed: false,
            reason: "session_not_regular",
            context: { sessionPhase: opts.sessionPhase },
        };
    }

    // [2] 장 종료 N분 전 진입 금지
    const minsLeft = minutesToSessionClose(now);
    if (minsLeft !== null && minsLeft <= noEntryMins) {
        return {
            allowed: false,
            reason: "near_session_close",
            context: { minutesLeft: minsLeft, noEntryMinutes: noEntryMins },
        };
    }

    // [3] 일 손실 한도 초과 (realized + unrealized 합산)
    const totalPnl = opts.dailyLoss.realizedPnlKrw + opts.dailyLoss.unrealizedPnlKrw;
    if (totalPnl <= -Math.abs(opts.dailyLossLimitKrw)) {
        return {
            allowed: false,
            reason: "daily_loss_limit_exceeded",
            context: {
                realizedPnlKrw: opts.dailyLoss.realizedPnlKrw,
                unrealizedPnlKrw: opts.dailyLoss.unrealizedPnlKrw,
                totalPnlKrw: totalPnl,
                limitKrw: -Math.abs(opts.dailyLossLimitKrw),
            },
        };
    }

    return { allowed: true, reason: null };
}

// -----------------------------------------------------------------
// 강제 청산 여부 판단
// -----------------------------------------------------------------

export interface LiveForceExitResult {
    shouldExit: boolean;
    reason: string | null;
    context?: Record<string, unknown>;
}

/**
 * 보유 포지션을 강제 청산해야 하는지 판단한다.
 *
 * @param forceExitMinutes 장 마감 N분 전 강제 청산 시작 (기본 10분)
 * @param forceExitEnabled 당일 강제 청산 활성화 여부 (기본 true)
 */
export function evaluateLiveForceExit(
    now: Date,
    opts: {
        forceExitMinutes?: number;   // default: 10
        forceExitEnabled?: boolean;  // default: true
        sessionPhase: string;
    }
): LiveForceExitResult {
    const forceExitMins = opts.forceExitMinutes ?? 10;
    const enabled = opts.forceExitEnabled !== false; // 기본 true

    if (!enabled) {
        return { shouldExit: false, reason: null };
    }

    if (opts.sessionPhase !== "REGULAR") {
        return { shouldExit: false, reason: null };
    }

    const minsLeft = minutesToSessionClose(now);
    if (minsLeft !== null && minsLeft <= forceExitMins) {
        return {
            shouldExit: true,
            reason: "force_exit_near_close",
            context: { minutesLeft: minsLeft, forceExitMinutes: forceExitMins },
        };
    }

    return { shouldExit: false, reason: null };
}

// -----------------------------------------------------------------
// 쿨다운 추적 (중복 주문 방지 보조)
// -----------------------------------------------------------------

const _lastOrderAt = new Map<string, number>(); // symbol → epoch ms

/**
 * 직전 주문 후 cooldown 이내이면 true (재주문 금지).
 * @param cooldownMs 쿨다운 밀리초 (기본 60_000 = 1분)
 */
export function isWithinOrderCooldown(symbol: string, cooldownMs = 60_000): boolean {
    const last = _lastOrderAt.get(symbol);
    if (last === undefined) return false;
    return Date.now() - last < cooldownMs;
}

/** 주문 전송 직후 반드시 호출 */
export function recordOrderTimestamp(symbol: string): void {
    _lastOrderAt.set(symbol, Date.now());
}

/** 일 시작 시 또는 테스트 시 초기화 */
export function clearOrderCooldowns(): void {
    _lastOrderAt.clear();
}
