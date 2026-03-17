export type RateRow = {
    id: string;
    workerId: string;
    won: number;
    effectiveFrom: string; // YYYY-MM-DD
    effectiveTo?: string;  // YYYY-MM-DD | ""
    createdAt: string;
    createdBy?: string;
};

function norm(v: any) {
    return String(v ?? "").trim();
}

function cmpDate(a: string, b: string) {
    // YYYY-MM-DD 비교
    return norm(a).localeCompare(norm(b));
}

/** 특정 날짜에 유효한 단가 1개 */
export function getRateForDate(rates: RateRow[], workerId: string, date: string) {
    const wid = norm(workerId);
    const d = norm(date);
    const list = (rates || [])
        .filter(r => norm(r.workerId) === wid)
        .filter(r => {
            const fromOk = cmpDate(norm(r.effectiveFrom), d) <= 0;
            const to = norm(r.effectiveTo || "");
            const toOk = !to || cmpDate(d, to) <= 0;
            return fromOk && toOk;
        })
        .sort((a, b) => cmpDate(b.effectiveFrom, a.effectiveFrom)); // 최신 from 우선
    return list[0] || null;
}

/** 현재 단가 = 오늘 기준 */
export function getCurrentRate(rates: RateRow[], workerId: string) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const r = getRateForDate(rates, workerId, `${yyyy}-${mm}-${dd}`);
    return r;
}

// ✅ [부장님 지시] 단가 규격

/**
 * ✅ [부장님 지시] 단가 규격 (Requirement 1/2)
 * DB: 원(WON) 정수 (예: 150000)
 * UI 입력: 만원 단위 숫자 (예: 15, 15.5)
 * UI 표시: "15만원" 형식
 */

/** 1. UI 입력(만원) -> DB 저장(원) */
export function toWonFromMan(inputMan: number | string): number {
    const man = typeof inputMan === "string" ? parseFloat(inputMan.replace(/,/g, "")) : inputMan;
    if (isNaN(man)) return 0;
    return Math.round(man * 10000);
}

/** 2. DB 저장(원) -> UI 표시(문자열) */
export function toManLabelFromWon(won: number): string {
    const man = (Number(won) || 0) / 10000;
    // 소수는 .0 제거, 1자리까지만 허용 (예: 15.5)
    const s = Number.isInteger(man) ? String(man) : String(Math.round(man * 10) / 10);
    return `${s}만원`;
}

/** 
 * 3. 서버측 강제 정유화 + 검증 (Requirement 2)
 * 클라이언트가 만원단위/원단위 섞어 보내도 서버에서 영구 고정
 */
export function normalizeWon(v: any): number {
    let won = Number(v) || 0;

    // [부장님 규칙] 
    // - 10,000 미만이면 "만원 단위가 원으로 잘못 들어온 것" (예: 15 -> 150000)
    if (won > 0 && won < 10000) {
        won = won * 10000;
    }
    // - 100,000,000 이상이면 "원값에 10000이 또 곱해진 것" (예: 15억 -> 15만)
    else if (won >= 100000000) {
        won = Math.round(won / 10000);
    }

    // 최종 검증
    if (won > 0 && (won < 10000 || won >= 100000000)) {
        throw new Error(`비정상적인 단가 데이터입니더 (값: ${v} -> 보정: ${won})`);
    }

    return Math.round(won);
}

/** 
 * ✅ [부장님 지시] 단가 표준 해석 함수 (parseWageMan)
 * "16만", "16", 16, "15.5만", 15.5 모두 정상 파싱 -> 만원 단위 숫자(float) 반환
 * 0/null/undefined/"" 는 0 반환
 */
export function parseWageMan(v: any): number {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return isNaN(v) ? 0 : v;

    const s = String(v).trim();
    if (!s) return 0;

    // "만" 또는 "만원" 제거하고 숫자만 추출
    const cleaned = s.replace(/만.*/, "").replace(/[^0-9.]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}

/**
 * ✅ [부장님 지시] 작업자 마스터 단가 표준 해석 (resolveWorkerMasterWage)
 * 우선순위:
 * 1) positive number worker.rateManwon
 * 2) parse positive worker.wage
 * 3) parse positive worker.dailyWage
 * 4) parse positive worker.baseWage
 * 5) 0
 */
export function resolveWorkerMasterWage(worker: any): number {
    if (!worker) return 0;

    // 1) rateManwon (숫자형 우선)
    const r1 = Number(worker.rateManwon);
    if (!isNaN(r1) && r1 > 0) return r1;

    // 2) wage (기존 문자열 필드)
    const r2 = parseWageMan(worker.wage);
    if (r2 > 0) return r2;

    // 3) dailyWage (호환용)
    const r3 = parseWageMan(worker.dailyWage);
    if (r3 > 0) return r3;

    // 4) baseWage (호환용)
    const r4 = parseWageMan(worker.baseWage);
    if (r4 > 0) return r4;

    return 0;
}

/**
 * ✅ [부장님 지시] 행별 최종 단가 계산 규칙 (resolveFinalWage)
 * 1) wage_snapshot 가 양수면 snapshot 사용 (snapshot=0은 무시)
 * 2) 아니면 resolveWorkerMasterWage(matchedWorker) 사용
 * 3) 그래도 없으면 0
 */
export function resolveFinalWage(submissionWorker: any, matchedWorker: any): number {
    // submissionWorker.rateManwon 이 스냅샷 역할
    const snapshot = parseWageMan(submissionWorker?.rateManwon);
    if (snapshot > 0) return snapshot;

    return resolveWorkerMasterWage(matchedWorker);
}

/** 
 * ✅ [부장님 지시] 지급구분 표준 상수
 */
export const PAYOUT_MAIN = "원청지급";
export const PAYOUT_JJ = "jj해체정리";
export const PAYOUT_INSUR = "4대보험지급";

/**
 * ✅ [부장님 지시] 지급구분 표준 해석 함수 (resolvePayoutType)
 * 우선순위:
 * 1) snapshot.paymentType (개별 출역 정보)
 * 2) matchedWorker.paymentType (인력 관리 마스터 정보)
 * 3) subPayoutType (현장/제출 기본값)
 * 4) "원청지급" (최종 fallback)
 */
export function resolvePayoutType(sw: any, dbW: any, subPayoutType?: string): string {
    const p1 = (sw?.paymentType || "").trim();
    if (p1) return p1;

    const p2 = (dbW?.paymentType || "").trim();
    if (p2) return p2;

    const p3 = (subPayoutType || "").trim();
    if (p3) return p3;

    return PAYOUT_MAIN;
}

/**
 * ✅ [부장님 지시] 지급구분 그룹화 함수 (resolvePayoutGroup)
 * 결과값: "main" | "jj" | "insur" | "other"
 */
export function resolvePayoutGroup(pt?: string): "main" | "jj" | "insur" | "other" {
    const t = (pt || "").replace(/\s/g, "").toLowerCase();
    if (t === PAYOUT_MAIN) return "main";
    // "jj" 포함하거나 "jj해체정리"와 일치하면 jj
    if (t.includes("jj") || t.includes("jj해체정리")) return "jj";
    if (t === PAYOUT_INSUR) return "insur";
    return "other";
}

/** 기존 함수들 (호환성 유지하되 내부로직 위임) */
export function formatWage(v: number | string | undefined | null): string {
    // v가 원 단위일 수도 있고 만 단위일 수도 있음. normalizeWon을 거쳐서 안전하게 표시
    let won = 0;
    const n = Number(v || 0);
    if (n > 0 && n < 10000) won = n * 10000; // 만단위 유입
    else won = n;

    return toManLabelFromWon(won);
}

export function parseWage(v: any): number {
    const man = parseWageMan(v);
    return toWonFromMan(man);
}
