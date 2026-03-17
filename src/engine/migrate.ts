import { AppState, CURRENT_SCHEMA_VERSION, initialState } from "./types";

export function migrateState(raw: any): AppState {
    // 1. 깨짐 체크 및 기본 구조 확보
    if (!raw || typeof raw !== "object") {
        return { ...initialState };
    }

    // 2. 버전 정보가 없거나 이상하면 0으로 간주
    let version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;

    // 현재 복사본 (mutating for migrations)
    let state = { ...raw };

    // 3. 업그레이드 단계
    if (version < 1) {
        // v0 -> v1 마이그레이션 로직
        state.schemaVersion = 1;
        if (typeof state.zone !== "string") state.zone = initialState.zone;
        if (!Array.isArray(state.items)) state.items = [...initialState.items];
        if (!Array.isArray(state.attachments)) state.attachments = [...(initialState.attachments || [])];
        version = 1;
    }

    // 미래의 마이그레이션
    // if (version < 2) { ... }

    // 4. 안전 보장 (필수 키 누락 등에 대한 폴백)
    return {
        schemaVersion: state.schemaVersion ?? CURRENT_SCHEMA_VERSION,
        zone: typeof state.zone === "string" ? state.zone : initialState.zone,
        items: Array.isArray(state.items) ? state.items : [],
        attachments: Array.isArray(state.attachments) ? state.attachments : []
    };
}
