/**
 * Live Auto-Trading — In-Memory Position Store
 *
 * 실전 루프용 싱글턴 포지션 레지스터.
 * 프로세스 재시작 시 초기화됨 (v1에서는 메모리만 사용).
 *
 * 절대 원칙:
 *  - 이 파일은 broker/주문 로직을 포함하지 않음
 *  - 상태 변경은 반드시 명시적 함수 호출로만 가능
 *  - live-loop.ts 에서만 상태를 변경할 것
 */

export interface LivePosition {
    /** 키움 종목코드 (6자리 숫자 문자열) */
    symbol: string;
    /** 포지션 방향 (현재는 BUY만 사용) */
    side: "BUY" | "SELL";
    /** 보유 수량 */
    qty: number;
    /** 진입 체결가 */
    entryPrice: number;
    /** 진입 시 평가금액 (entryPrice * qty) */
    entryNotionalKrw: number;
    /** 진입 시각 (ISO 8601) */
    entryAt: string;
    /** 신호 후보 시각 (ISO 8601) */
    candidate_at: string;
    /** 진입 사유 코드 (scoring.ts reason 값) */
    entryReasonCode: string;
    /** 가장 최근 현재가 (매 tick 갱신) */
    lastPrice: number;
    /** 미실현 손익 KRW (매 tick 갱신, 수수료 미포함 gross) */
    unrealizedPnlKrw: number;
    /** 마지막 상태 갱신 시각 (ISO 8601) */
    updatedAt: string;
    /** 보유 중 최고가 (trailing stop / MFE 계산용) */
    highestPrice: number;
    /** 보유 중 최저가 (MAE 계산용) */
    lowestPrice: number;
    /** 키움 주문번호 (체결 확인용) */
    orderId?: string;
}

// 프로세스 내 싱글턴 — 외부에서 직접 접근 금지
const _positions = new Map<string, LivePosition>();

// -----------------------------------------------------------------
// 조회
// -----------------------------------------------------------------

export function getLivePositions(): LivePosition[] {
    return [..._positions.values()];
}

export function getLivePosition(symbol: string): LivePosition | undefined {
    return _positions.get(symbol);
}

export function hasLivePosition(symbol: string): boolean {
    return _positions.has(symbol);
}

export function liveOpenCount(): number {
    return _positions.size;
}

// -----------------------------------------------------------------
// 변경 (live-loop.ts 에서만 호출)
// -----------------------------------------------------------------

export function openLivePosition(pos: LivePosition): void {
    if (_positions.has(pos.symbol)) {
        console.warn(`[live-position-store] openLivePosition: already open → ${pos.symbol}`);
        return;
    }
    _positions.set(pos.symbol, { ...pos });
    console.info(
        `[live-position-store] opened  symbol=${pos.symbol}  qty=${String(pos.qty)}  entryPrice=${String(pos.entryPrice)}  side=${pos.side}`
    );
}

/**
 * 매 tick 마다 현재가를 넘겨 미실현손익 + 최고/최저가 갱신
 */
export function updateLivePosition(symbol: string, currentPrice: number, updatedAt: string): void {
    const p = _positions.get(symbol);
    if (!p) return;
    p.lastPrice = currentPrice;
    p.unrealizedPnlKrw = (currentPrice - p.entryPrice) * p.qty;
    p.updatedAt = updatedAt;
    if (currentPrice > p.highestPrice) p.highestPrice = currentPrice;
    if (currentPrice < p.lowestPrice) p.lowestPrice = currentPrice;
}

/**
 * 포지션 종료 후 제거.
 * @returns 종료된 포지션 (없으면 undefined)
 */
export function closeLivePosition(symbol: string): LivePosition | undefined {
    const p = _positions.get(symbol);
    if (!p) {
        console.warn(`[live-position-store] closeLivePosition: no open position → ${symbol}`);
        return undefined;
    }
    _positions.delete(symbol);
    console.info(
        `[live-position-store] closed  symbol=${symbol}  qty=${String(p.qty)}  entryPrice=${String(p.entryPrice)}  lastPrice=${String(p.lastPrice)}  unrealizedPnlKrw=${String(p.unrealizedPnlKrw)}`
    );
    return p;
}

// -----------------------------------------------------------------
// 진단 (dashboard / monitor 연동용)
// -----------------------------------------------------------------

/** 현재 포지션 상태를 직렬화 가능한 배열로 반환 */
export function snapshotLivePositions(): {
    symbol: string;
    side: "BUY" | "SELL";
    qty: number;
    entryPrice: number;
    entryNotionalKrw: number;
    lastPrice: number;
    unrealizedPnlKrw: number;
    entryAt: string;
    updatedAt: string;
    highestPrice: number;
    lowestPrice: number;
    entryReasonCode: string;
}[] {
    return getLivePositions().map((p) => ({
        symbol: p.symbol,
        side: p.side,
        qty: p.qty,
        entryPrice: p.entryPrice,
        entryNotionalKrw: p.entryNotionalKrw,
        lastPrice: p.lastPrice,
        unrealizedPnlKrw: p.unrealizedPnlKrw,
        entryAt: p.entryAt,
        updatedAt: p.updatedAt,
        highestPrice: p.highestPrice,
        lowestPrice: p.lowestPrice,
        entryReasonCode: p.entryReasonCode,
    }));
}
