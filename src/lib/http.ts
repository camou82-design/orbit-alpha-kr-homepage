// src/lib/http.ts
/**
 * ✅ res.json() 직격 금지: 응답이 비었거나 JSON이 아닐 때 터지는 것 방지
 */
export async function safeJson<T = any>(res: Response): Promise<T | null> {
    const text = await res.text().catch(() => "");
    if (!text) return null;

    // JSON이 아닌(HTML 등) 경우도 방어
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        try {
            return JSON.parse(text) as T;
        } catch {
            return null;
        }
    }

    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

/**
 * ✅ GET 요청용 안전 래퍼
 */
export async function apiGet<T = any>(url: string): Promise<{ ok: boolean; data?: T; error?: string }> {
    try {
        const res = await fetch(url, { cache: "no-store" });
        const j = await safeJson<T & { ok?: boolean; error?: string }>(res);

        // 응답이 비었거나 JSON이 아니면: 안전하게 실패 처리
        if (!j) return { ok: false, error: "empty_or_non_json_response" };

        // 서버가 ok를 주는 구조면 그대로 사용 (NextResponse.json({ ok: false }))
        if ((j as any).ok === false) return { ok: false, error: (j as any).error || "api_error" };

        // HTTP status가 실패인데 ok가 없는 경우 (보통 Next 내장 에러 등)
        if (!res.ok) return { ok: false, error: (j as any).error || `http_${res.status}` };

        return { ok: true, data: j as any };
    } catch (e: any) {
        return { ok: false, error: e?.message || "network_error" };
    }
}
