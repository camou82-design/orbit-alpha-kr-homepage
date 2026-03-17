import { AppState } from "./types"
import { migrateState } from "./migrate"
import { assertEngineSanity } from "./selfcheck"

const KEY = "risk-dashboard-v2:engine"
let saveTimeout: ReturnType<typeof setTimeout> | null = null

export function saveState(state: AppState) {
    if (typeof window === "undefined") return

    // 저장 불가능한 값들 원천 차단
    assertEngineSanity(state);

    // 간단한 debounce로 과도한 저장 방지
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
        try {
            localStorage.setItem(KEY, JSON.stringify(state))
        } catch (error) {
            console.warn("localStorage 저장 실패:", error)
            // 에러를 던지지 않고 silent fail (ui 깨짐 방지)
        }
    }, 300)
}

export function loadState(): AppState {
    if (typeof window === "undefined") return migrateState(null)
    try {
        const raw = localStorage.getItem(KEY)
        const parsed = raw ? JSON.parse(raw) : null
        return migrateState(parsed)
    } catch (error) {
        console.warn("localStorage 파싱 실패. 기본값/복구값 반환:", error)
        return migrateState(null)
    }
}
