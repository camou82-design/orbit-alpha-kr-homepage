/**
 * Live Order Tracker
 *
 * 주문 원장: 미체결 / 부분체결 / 완료 상태를 orderId 단위로 추적.
 *
 * 설계 원칙:
 *  - 이 파일은 상태 추적 전용 — 실제 주문 전송·취소 API 호출 없음
 *  - live-loop.ts 가 결과를 받아 브로커 API 호출 결정
 *  - 모든 상태 변경은 명시적 함수 호출로만 가능
 *  - orderId 없이 추가된 주문은 임시 ID로 등록, 이후 업데이트 가능
 */

// -----------------------------------------------------------------
// 타입 정의
// -----------------------------------------------------------------

export type OrderSide = "BUY" | "SELL";

export type OrderStatus =
    | "PENDING"          // 전송됨, 체결 미확인
    | "PARTIAL"          // 부분체결 — 잔여 수량 있음
    | "FILLED"           // 완전 체결
    | "CANCELLED"        // 취소 완료
    | "CANCEL_REQUESTED" // 취소 요청 전송 후 확인 대기
    | "REJECTED"         // 브로커 거부
    | "EXPIRED";         // 만료 (당일 미체결 등)

export interface TrackedOrder {
    /** 키움 주문번호 (없으면 임시 ID `tmp_{ts}_{symbol}`) */
    orderId: string;
    symbol: string;
    side: OrderSide;
    /** 요청 수량 */
    requestedQty: number;
    /** 누적 체결 수량 */
    filledQty: number;
    /** 미체결 잔여 수량 (requestedQty - filledQty) */
    remainingQty: number;
    status: OrderStatus;
    /** 주문 전송 시각 (ISO 8601) */
    submittedAt: string;
    /** 마지막 상태 확인 시각 (ISO 8601) */
    lastCheckedAt: string;
    /** 평균 체결가 (부분/완전 체결 시 업데이트) */
    avgFillPrice: number | null;
    /** 취소 요청 여부 (중복 취소 요청 방지) */
    cancelRequested: boolean;
    /** 완료(terminal) 상태 여부 — FILLED / CANCELLED / REJECTED / EXPIRED */
    done: boolean;
}

// -----------------------------------------------------------------
// 스토어 (프로세스 내 싱글턴)
// -----------------------------------------------------------------

const _orders = new Map<string, TrackedOrder>();

// -----------------------------------------------------------------
// 내부 헬퍼
// -----------------------------------------------------------------

function tmpOrderId(symbol: string): string {
    return `tmp_${Date.now()}_${symbol}`;
}

function isTerminal(status: OrderStatus): boolean {
    return (
        status === "FILLED" ||
        status === "CANCELLED" ||
        status === "REJECTED" ||
        status === "EXPIRED"
    );
}

// -----------------------------------------------------------------
// 주문 등록 / 조회
// -----------------------------------------------------------------

/**
 * 새 주문을 추적 대장에 등록한다.
 * @returns 등록된 orderId (전달된 값 또는 임시 ID)
 */
export function registerOrder(opts: {
    orderId?: string;
    symbol: string;
    side: OrderSide;
    requestedQty: number;
    submittedAt: string;
}): string {
    const id = opts.orderId && opts.orderId.trim() ? opts.orderId.trim() : tmpOrderId(opts.symbol);

    const order: TrackedOrder = {
        orderId: id,
        symbol: opts.symbol,
        side: opts.side,
        requestedQty: opts.requestedQty,
        filledQty: 0,
        remainingQty: opts.requestedQty,
        status: "PENDING",
        submittedAt: opts.submittedAt,
        lastCheckedAt: opts.submittedAt,
        avgFillPrice: null,
        cancelRequested: false,
        done: false,
    };

    _orders.set(id, order);
    console.info(`[live-order-tracker] registered  orderId=${id}  symbol=${opts.symbol}  side=${opts.side}  qty=${String(opts.requestedQty)}`);
    return id;
}

/** orderId로 주문 조회 */
export function getOrder(orderId: string): TrackedOrder | undefined {
    return _orders.get(orderId);
}

/** 전체 주문 목록 */
export function getAllOrders(): TrackedOrder[] {
    return [..._orders.values()];
}

/** 완료되지 않은 (미체결 포함) 주문 목록 */
export function getPendingOrders(): TrackedOrder[] {
    return [..._orders.values()].filter((o) => !o.done);
}

/** 완료된 주문 목록 */
export function getDoneOrders(): TrackedOrder[] {
    return [..._orders.values()].filter((o) => o.done);
}

// -----------------------------------------------------------------
// 신규 진입 차단: 동일 종목 미체결 주문 존재 여부
// -----------------------------------------------------------------

/**
 * 해당 종목에 아직 완료되지 않은 주문(미체결 또는 부분체결)이 존재하면 true.
 * live-loop.ts 에서 신규 진입 전 반드시 호출해야 한다.
 */
export function hasPendingOrderForSymbol(symbol: string): boolean {
    for (const o of _orders.values()) {
        if (o.symbol === symbol && !o.done) return true;
    }
    return false;
}

/**
 * 해당 종목의 미완료 주문 목록 (상세 확인용).
 */
export function getPendingOrdersForSymbol(symbol: string): TrackedOrder[] {
    return [..._orders.values()].filter((o) => o.symbol === symbol && !o.done);
}

// -----------------------------------------------------------------
// 상태 업데이트
// -----------------------------------------------------------------

/**
 * 체결 콜백 또는 폴링 결과를 반영한다.
 * `filledQty` 누적 반영 후 status 자동 결정.
 */
export function updateOrderFill(
    orderId: string,
    opts: {
        filledQty: number;        // 이번 체결로 새로 더해진 수량 (증분)
        avgFillPrice?: number;    // 이번 체결 단가 (없으면 기존 유지)
        checkedAt: string;        // ISO 8601
    }
): TrackedOrder | null {
    const o = _orders.get(orderId);
    if (!o) {
        console.warn(`[live-order-tracker] updateOrderFill: orderId not found → ${orderId}`);
        return null;
    }
    if (o.done) {
        console.warn(`[live-order-tracker] updateOrderFill: order already done → ${orderId}`);
        return o;
    }

    o.filledQty = Math.min(o.requestedQty, o.filledQty + opts.filledQty);
    o.remainingQty = o.requestedQty - o.filledQty;
    o.lastCheckedAt = opts.checkedAt;
    if (opts.avgFillPrice !== undefined) o.avgFillPrice = opts.avgFillPrice;

    if (o.remainingQty <= 0) {
        o.status = "FILLED";
        o.done = true;
    } else if (o.filledQty > 0) {
        o.status = "PARTIAL";
    }

    console.info(
        `[live-order-tracker] fill  orderId=${orderId}  filledQty=${String(o.filledQty)}/${String(o.requestedQty)}  status=${o.status}`
    );
    return o;
}

/**
 * 주문을 CANCELLED / REJECTED / EXPIRED 로 완료 처리한다.
 */
export function finalizeOrder(
    orderId: string,
    status: "CANCELLED" | "REJECTED" | "EXPIRED",
    checkedAt: string
): TrackedOrder | null {
    const o = _orders.get(orderId);
    if (!o) {
        console.warn(`[live-order-tracker] finalizeOrder: orderId not found → ${orderId}`);
        return null;
    }
    o.status = status;
    o.done = true;
    o.lastCheckedAt = checkedAt;
    console.info(`[live-order-tracker] finalized  orderId=${orderId}  status=${status}`);
    return o;
}

/**
 * 취소 요청을 기록 (실제 API 호출은 호출자 책임).
 * 이미 취소 요청한 주문이면 false 반환.
 */
export function markCancelRequested(orderId: string): boolean {
    const o = _orders.get(orderId);
    if (!o || o.done || o.cancelRequested) return false;
    o.cancelRequested = true;
    console.info(`[live-order-tracker] cancel requested  orderId=${orderId}`);
    return true;
}

// -----------------------------------------------------------------
// 타임아웃 만료 처리
// -----------------------------------------------------------------

/**
 * 지정 시간(ms)이 넘도록 PENDING/PARTIAL 상태인 주문을 찾는다.
 * 호출자가 취소 API를 호출하고 `finalizeOrder` 로 마무리해야 함.
 *
 * @param timeoutMs 미체결 허용 시간 (기본 5분 = 300_000 ms)
 */
export function findTimedOutOrders(now: Date, timeoutMs = 300_000): TrackedOrder[] {
    const stale: TrackedOrder[] = [];
    for (const o of _orders.values()) {
        if (o.done) continue;
        if (o.status !== "PENDING" && o.status !== "PARTIAL") continue;
        const age = now.getTime() - new Date(o.submittedAt).getTime();
        if (age > timeoutMs) stale.push(o);
    }
    return stale;
}

// -----------------------------------------------------------------
// 진단 / 스냅샷
// -----------------------------------------------------------------

/** 현재 미완료 주문 상태를 직렬화 가능한 배열로 반환 */
export function snapshotPendingOrders(): {
    orderId: string;
    symbol: string;
    side: OrderSide;
    status: OrderStatus;
    requestedQty: number;
    filledQty: number;
    remainingQty: number;
    submittedAt: string;
    cancelRequested: boolean;
}[] {
    return getPendingOrders().map((o) => ({
        orderId: o.orderId,
        symbol: o.symbol,
        side: o.side,
        status: o.status,
        requestedQty: o.requestedQty,
        filledQty: o.filledQty,
        remainingQty: o.remainingQty,
        submittedAt: o.submittedAt,
        cancelRequested: o.cancelRequested,
    }));
}

/** 완료된 주문 제거(메모리 관리용 — 보통 일 마감 후 호출) */
export function purgeDoneOrders(): number {
    let removed = 0;
    for (const [id, o] of _orders.entries()) {
        if (o.done) {
            _orders.delete(id);
            removed += 1;
        }
    }
    if (removed > 0) {
        console.info(`[live-order-tracker] purged ${String(removed)} done orders`);
    }
    return removed;
}
