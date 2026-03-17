import type { AppState } from "./types";

type JsonSafe =
    | null
    | boolean
    | number
    | string
    | JsonSafe[]
    | { [k: string]: JsonSafe };

// 함수/Date/순환참조/BigInt 같은 “저장하면 터지는 것들” 차단
export function assertEngineSanity(state: AppState): void {
    // 1) undefined 금지 (persist 시 깨짐)
    // 2) Date, Function, BigInt 금지
    // 3) 순환참조 금지
    // 4) triggers/media는 반드시 “순수 JSON” 이어야 함

    const seen = new WeakSet<object>();

    const walk = (v: any, path: string) => {
        if (v === undefined) throw new Error(`EngineSanity: undefined at ${path}`);

        const t = typeof v;
        if (t === "function") throw new Error(`EngineSanity: function at ${path}`);
        if (t === "bigint") throw new Error(`EngineSanity: bigint at ${path}`);

        if (v instanceof Date) throw new Error(`EngineSanity: Date at ${path}`);

        if (v && t === "object") {
            if (seen.has(v)) throw new Error(`EngineSanity: circular ref at ${path}`);
            seen.add(v);

            if (Array.isArray(v)) {
                for (let i = 0; i < v.length; i++) walk(v[i], `${path}[${i}]`);
                return;
            }

            for (const k of Object.keys(v)) {
                walk(v[k], `${path}.${k}`);
            }
        }
    };

    // 엔진 전체를 검사하면 비용이 커질 수 있으니,
    // “깨지기 쉬운 저장 영역” 위주로만 검사해도 충분함.
    // 여기선 전체 검사(안전 최우선)로 둠.
    walk(state as unknown as JsonSafe, "engine");
}
