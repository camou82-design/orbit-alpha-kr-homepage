/**
 * ✅ [안전장치] RAW_ 접두사 제거 (UI 표시용)
 * "RAW_" 또는 "RAW_RAW_" 등 중복된 접두사까지 모두 제거해서 깔끔한 이름 반환
 */
export function stripRawPrefix(name: string): string {
    if (!name) return "";
    let s = name.trim();
    while (s.toUpperCase().startsWith("RAW_")) {
        s = s.slice(4);
    }
    return s || "현장 미지정";
}

/**
 * ✅ [안전장치] RAW_ 키 정규화 (DB 저장용)
 * 공백을 언더바로 바꾸고, "RAW_" 접두사를 하나만 붙임
 */
export function normalizeRawKey(name: string): string {
    if (!name) return "";
    let s = name.trim().replace(/\s+/g, "_");
    // 기존에 RAW_ 가 붙어있으면 떼어내고 다시 붙여서 하나만 있게 보정
    while (s.toUpperCase().startsWith("RAW_")) {
        s = s.slice(4);
    }
    return `RAW_${s}`;
}
