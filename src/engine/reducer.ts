import { AppState, initialState } from "./types"
import { Action } from "./actions"

export function reducer(state: AppState = initialState, action: Action): AppState {
    // 안전 장치: state가 이상하면 일단 initialState부터 시도 (migrate는 초기 로드 시 담당)
    const safeState = state || initialState;

    try {
        switch (action?.type) {
            case "SET_ZONE":
                return { ...safeState, zone: action.payload ?? safeState.zone }

            case "ADD_ITEM":
                if (!action.payload) return safeState;
                return { ...safeState, items: [...(safeState.items || []), action.payload] }

            case "RESET":
                return { ...initialState, schemaVersion: safeState.schemaVersion } // 버전 유지

            default:
                return safeState
        }
    } catch (err) {
        console.warn("Reducer 처리 중 에러 방어:", err)
        return safeState // 절대 깨지지 않음
    }
}
