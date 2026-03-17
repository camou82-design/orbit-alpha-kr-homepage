/**
 * [lib/hangul.ts]
 * 한글 초성 추출 및 이름 정규화 유틸리티
 */

const CHOSUNG = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
];

/**
 * 문자열에서 한글 초성만 추출 (검색용)
 */
export function getChosung(str: string): string {
    if (!str) return "";
    let res = "";
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i) - 44032;
        if (code > -1 && code < 11172) {
            res += CHOSUNG[Math.floor(code / 588)];
        } else {
            res += str.charAt(i);
        }
    }
    return res;
}

/**
 * 이름 정규화 (공백 제거 등)
 */
export function normalizeName(name: string): string {
    if (!name) return "";
    return name.trim().replace(/\s+/g, "");
}
