import { INDUSTRY_RULES } from "./industryRules";

export type IndustryKey = keyof typeof INDUSTRY_RULES;

/**
 * [신형] 직종(Trade) 선택 옵션 - 공종 중심 단일 카탈로그
 */
export const INDUSTRY_TRADE_OPTIONS = [
    "설비(반입/정렬/설치)",
    "배관(공정/유틸/가스/배기)",
    "전기(케이블/판넬/동력)",
    "계장(제어/계측/통신)",
    "덕트/HVAC(공조/배기/환기)",
    "토목(굴착/콘크리트/되메우기)"
] as const;

export type IndustryTradeOption = (typeof INDUSTRY_TRADE_OPTIONS)[number];
export const INDUSTRY_OPTIONS = INDUSTRY_TRADE_OPTIONS; // ✅ 하위 호환 및 글로벌 상수용

/**
 * 업종 키를 받아서 상위 그룹명(Label)으로 반환 (하위 호환용)
 */
export type IndustryGroup = "토목/토공" | "건축" | "기타(직접입력)";

export function getIndustryGroupLabel(industry: any): string {
    const s = String(industry ?? "").trim();
    if (s.includes("토목")) return "토목/토공";
    if (s.includes("건축")) return "건축";
    return "기타(직접입력)";
}

/**
 * 정규화용
 */
export function normalizeIndustry(input: any): IndustryKey {
    const raw = String(input ?? "").trim();
    if ((INDUSTRY_RULES as any)[raw]) return raw as IndustryKey;

    if (raw.includes("토목")) return "토목(굴착/콘크리트/되메우기)" as IndustryKey;
    if (raw.includes("배관")) return "배관(공정/유틸/가스/배기)" as IndustryKey;
    if (raw.includes("전기")) return "전기(케이블/판넬/동력)" as IndustryKey;
    if (raw.includes("설비")) return "설비(반입/정렬/설치)" as IndustryKey;
    if (raw.includes("계장")) return "계장(제어/계측/통신)" as IndustryKey;
    if (raw.includes("덕트") || raw.includes("HVAC")) return "덕트/HVAC(공조/배기/환기)" as IndustryKey;

    return "기타(직접입력)" as IndustryKey;
}

export const INDUSTRY_LABEL: Record<string, string> =
    INDUSTRY_TRADE_OPTIONS.reduce((acc, k) => {
        acc[k] = k;
        return acc;
    }, {} as Record<string, string>);
