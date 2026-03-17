/**
 * ✅ [안전장치] Fetch 응답 파싱 유틸리티 (Ironclad 버전)
 * - retryCount:실패 시 재시도 횟수 (기본 2회 -> 총 3회 시도)
 * - 자동 백오프: 300ms, 800ms
 */
export type SafeFetchResponse<T> = {
    ok: boolean;
    data?: T;
    error?: string;
    status: number;
    raw?: string;
};

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function safeFetchJSON<T = any>(
    url: string,
    options?: RequestInit,
    retryCount = 2
): Promise<SafeFetchResponse<T>> {
    let lastError = "";
    let lastStatus = 0;

    for (let i = 0; i <= retryCount; i++) {
        try {
            if (i > 0) {
                // 백오프 (300ms, 800ms)
                await sleep(i === 1 ? 300 : 800);
            }

            const res = await fetch(url, {
                ...options,
                cache: "no-store",
            });

            lastStatus = res.status;
            const text = await res.text().catch(() => "");

            // JSON 파싱 시도
            try {
                const j = text ? JSON.parse(text) : {};

                // 서버가 { ok: false } 를 준 경우도 실패로 간주 (재시도는 안 함)
                if (j && typeof j === 'object' && j.ok === false) {
                    return { ok: false, data: j, error: j.error || "SERVER_ERROR", status: res.status, raw: text };
                }

                if (!res.ok) {
                    // 5xx 에러면 루프 돌아서 재시도 가능
                    if (res.status >= 500) {
                        lastError = `HTTP_${res.status}`;
                        continue;
                    }
                    return { ok: false, data: j, error: j.error || `HTTP_${res.status}`, status: res.status, raw: text };
                }

                return { ok: true, data: j as T, status: res.status, raw: text };
            } catch (err) {
                // JSON 파싱 실패 (비정상 응답)
                if (res.ok) {
                    // 성공인데 JSON이 아니면? 빈 객체 리턴
                    return { ok: true, data: {} as T, status: res.status, raw: text };
                }
                lastError = "BAD_JSON";
                if (res.status >= 500) continue; // 재시도
                return { ok: false, error: "BAD_JSON", status: res.status, raw: text };
            }

        } catch (e: any) {
            lastError = e?.message || "NETWORK_ERROR";
            lastStatus = 0;
            // 네트워크 에러는 재시도
            continue;
        }
    }

    return { ok: false, error: lastError || "FETCH_FAILED", status: lastStatus };
}

// ✅ [안전장치] 데이터 배열 보장 유틸리티
export function asArray<T>(data: any): T[] {
    if (!data) return [];
    if (Array.isArray(data)) return data as T[];
    if (typeof data === 'object' && Array.isArray(data.items)) return data.items as T[];
    return [];
}

// 하위 호환성 유지
export const safeFetch = safeFetchJSON;
