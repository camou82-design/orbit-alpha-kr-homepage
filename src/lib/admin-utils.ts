/**
 * [lib/admin-utils.ts]
 * 프로젝트 공통 정산 및 날짜 규칙 (부장님 지시: 운영 안전장치)
 */

export function normalizeWorkerName(name: string | undefined | null): string {
    if (!name) return "";
    return name.trim().replace(/\s+/g, "").toLowerCase();
}

/**
 * [부장님 지시] 현장명 정규화 (연속 출역 계산용)
 */
export function normalizeSiteName(name: string | undefined | null): string {
    if (!name) return "";
    // RAW_ 접두사 제거 로직은 siteUtils에 있으나, 여기서는 단순 공백제거/소문자화만 수행
    return name.trim().replace(/\s+/g, "").toLowerCase();
}

/**
 * 로컬(KST) 기준 날짜 키 생성
 * toISOString() 사용 금지
 */
export function getLocalKST(ts?: number) {
    const d = ts ? new Date(ts) : new Date();
    // [부장님 지시] 브라우저/서버 환경 불문 KST 고정을 위해 Intl 사용
    const formatter = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });

    const parts = formatter.formatToParts(d);
    const dateParts: { [key: string]: string } = {};
    parts.forEach(p => { dateParts[p.type] = p.value; });

    const yyyy = dateParts.year;
    const mm = dateParts.month;
    const dd = dateParts.day;
    const hh = dateParts.hour;
    const min = dateParts.minute;
    const ss = dateParts.second;

    return {
        dateKey: `${yyyy}-${mm}-${dd}`, // YYYY-MM-DD
        monthKey: `${yyyy}-${mm}`,      // YYYY-MM
        fullKey: `${yyyy}${mm}${dd}-${hh}${min}${ss}`
    };
}

/**
 * 정산 금액 계산 표준
 * - 미등록 인원(status !== 'active' 또는 workerId 없음)은 무조건 0원
 */
export function calcSettlement(rateManwon: number, isRegistered: boolean) {
    if (!isRegistered || !rateManwon) {
        return { rate: 0, tax: 0, payment: 0 };
    }

    const rate = rateManwon;
    // 세액공제 3.3% (만원 단위, 소수 첫째 자리 반올림)
    const tax = Math.round(rate * 0.033 * 10) / 10;
    const payment = Math.round((rate - tax) * 10) / 10;

    return { rate, tax, payment };
}

/**
 * 소프트 삭제 여부 확인
 */
export function isDeleted(item: any): boolean {
    return !!(item?.deleted || item?.deletedAt);
}

/**
 * 금액 표시 유틸 (UI용)
 */
export function formatManwon(val: number): string {
    return `${val.toLocaleString()}만`;
}

/**
 * 전송된 WorkerRef(이름 또는 불완전한 객체)와 전체 등록 Worker 목록을 비교하여
 * ID가 없더라도 이름이 정확히 일치하는 등록 인원을 찾아낸다.
 */
export function resolveWorker(submissionWorker: any, dbWorkers: any[]) {
    const rawId = typeof submissionWorker === "string" ? undefined : (submissionWorker?.workerId || submissionWorker?.id);
    const rawName = typeof submissionWorker === "string" ? submissionWorker : submissionWorker?.name;

    // 1. ID가 있으면 ID로 매칭 시도
    if (rawId) {
        const byId = dbWorkers.find(dw => dw.id === rawId && !dw.deleted);
        if (byId) {
            return {
                matched: true,
                worker: byId,
                registered: true,
                resolvedWorkerId: byId.id
            };
        }
    }

    // 2. ID가 없거나 못 찾았으면 이름 정규화 기반 매칭 시도
    const normName = normalizeWorkerName(rawName);
    if (normName) {
        const candidates = dbWorkers.filter(dw => !dw.deleted && normalizeWorkerName(dw.name) === normName);
        // 정확히 1명만 동명이인 없이 매칭되는 경우에만 등록으로 인정 (위험 방지)
        if (candidates.length === 1) {
            const byName = candidates[0];
            return {
                matched: true,
                worker: byName,
                registered: true,
                resolvedWorkerId: byName.id
            };
        }
    }

    // 3. 미등록
    return {
        matched: false,
        worker: null,
        registered: false,
        resolvedWorkerId: rawId || null
    };
}

/**
 * [부장님 지시] 등록 여부 판정 통합 헬퍼
 * - resolveWorker 결과를 기반으로 최종 등록 여부만 반환
 */
export function isWorkerRegistered(submissionWorker: any, dbWorkers: any[]): boolean {
    return resolveWorker(submissionWorker, dbWorkers).registered;
}

/**
 * [부장님 지시: 전 페이지 공통 중복 판정 기준]
 * - 같은 날짜(dateKey)
 * - 같은 사람(이름 정규화 기준)
 * - 2건 이상 제출된 'pending' 상태의 데이터
 * @returns Set<string> (형식: "dateKey__normalizedName")
 */
export function getDuplicateMap(submissions: any[]): Set<string> {
    const pendingSubs = submissions.filter(s => s.status === "pending" && !s.deleted);
    const countMap = new Map<string, number>();

    pendingSubs.forEach(sub => {
        const dateKey = sub.submittedDateKey || getLocalKST(sub.timestamp).dateKey;
        (sub.workers || []).forEach((w: any) => {
            const name = typeof w === 'string' ? w : (w.name || "");
            const normName = normalizeWorkerName(name);
            if (!normName) return;

            const key = `${dateKey}__${normName}`;
            countMap.set(key, (countMap.get(key) || 0) + 1);
        });
    });

    const duplicateSet = new Set<string>();
    countMap.forEach((count, key) => {
        if (count >= 2) duplicateSet.add(key);
    });

    return duplicateSet;
}

/**
 * [부장님 지시] 동일 현장 연속 출역 일수 계산
 * - 기준 날짜(targetDate)부터 과거로 거슬러 올라가며 계산
 * - 하루라도 비거나 다른 현장이면 중단
 * - dateKey: YYYY-MM-DD
 */
export function getSameSiteConsecutiveDays(
    workerName: string,
    siteId: string | undefined,
    siteName: string,
    targetDateKey: string,
    allSubmissions: any[]
): number {
    const normWorker = normalizeWorkerName(workerName);
    const normSite = siteId || normalizeSiteName(siteName);

    // 1. 날짜순 정렬 (최신순)
    // [부장님 지시] 현재 시스템은 'pending'만 사용하므로 'pending' 포함
    const validSubs = allSubmissions.filter(s => (s.status === "confirmed" || s.status === "pending") && !s.deleted);

    // 날짜별로 그룹화 (같은 날 여러 번 출역한 경우 대비)
    const dateMap = new Map<string, Set<string>>(); // dateKey -> Set of normalizedSiteKeys
    validSubs.forEach(s => {
        const dKey = s.submittedDateKey || getLocalKST(s.timestamp).dateKey;
        if (!dateMap.has(dKey)) dateMap.set(dKey, new Set());

        const isTargetWorker = (s.workers || []).some((w: any) => {
            const wName = typeof w === 'string' ? w : (w.name || "");
            return normalizeWorkerName(wName) === normWorker;
        });

        if (isTargetWorker) {
            const sKey = s.siteId || normalizeSiteName(s.siteName);
            dateMap.get(dKey)!.add(sKey);
        }
    });

    // 2. targetDateKey 부터 역순 탐색 (YYYY-MM-DD 기준)
    let [y, m, d] = targetDateKey.split('-').map(Number);
    let count = 0;

    // 무한 루프 방지 (최대 100일까지만 체크)
    for (let i = 0; i < 100; i++) {
        const checkKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const sitesAtDate = dateMap.get(checkKey);

        if (!sitesAtDate || sitesAtDate.size === 0) {
            // 해당 날짜에 출역 없음 -> 중단 (단, i=0 인데 오늘 출역이 있는 경우는 count++ 됨)
            break;
        }

        if (sitesAtDate.has(normSite)) {
            // 해당 현장 출역 확인
            count++;
        } else {
            // 다른 현장만 출역함 -> 중단
            break;
        }

        // 하루 전으로 (로컬 날짜 기준 감산)
        const d_obj = new Date(y, m - 1, d);
        d_obj.setDate(d_obj.getDate() - 1);
        y = d_obj.getFullYear();
        m = d_obj.getMonth() + 1;
        d = d_obj.getDate();
    }

    return count;
}

/**
 * [부장님 지시] 연속 출역 경고 레벨 판정
 */
export function getWarningLevel(days: number): "caution" | "warning" | null {
    if (days >= 7) return "warning";
    if (days >= 6) return "caution";
    return null;
}
