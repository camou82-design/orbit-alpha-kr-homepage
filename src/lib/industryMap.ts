/**
 * Industry Mapping Engine
 * 츤데레 코다리 부장: "이게 바로 현장 데이터다. 딴소리 말고 이대로만 해!"
 */

import { Storage } from "./storage";
import { INDUSTRY_OPTIONS, IndustryKey } from "@/lib/semi/industryCatalog";
import { INDUSTRY_RULES } from "@/lib/semi/industryRules";

import {
    COMMON_TASK_TYPES,
    COMMON_EXTRA_RISKS,
    COMMON_EQUIPMENT,
    GLOBAL_MANDATORY_EQUIPMENT,
    SITUATIONAL_EQUIPMENT_RULES
} from "./constants";

/**
 * [HELPER] 문자열 배열에서 중복 제거
 */
export function uniq<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
}

export const commonWorkTypes = [...COMMON_TASK_TYPES];
export const commonRiskFactors = [...COMMON_EXTRA_RISKS];
export const commonEquipment = [...COMMON_EQUIPMENT];

/**
 * Step 1에서 사용되는 대분류 업종 목록 (Catalog에서 가져옴)
 */
export const industries = [...INDUSTRY_OPTIONS];

/**
 * [PATCH] 업종별 허용 위험요소 맵 (Catalog 기반 동적 생성)
 */
export const INDUSTRY_ALLOWED_HAZARDS: Record<string, string[]> = INDUSTRY_OPTIONS.reduce((acc, key) => {
    acc[key] = INDUSTRY_RULES[key].hazards;
    return acc;
}, {
    default: ["추락위험", "낙하/비래", "미끄럼", "절단/비산"]
} as any);

/**
 * 붕괴위험 추천 키워드
 */
const COLLAPSE_KEYWORDS = ["굴착", "트렌치", "흙막이", "동바리", "철거", "해체", "터널", "가설"];

/**
 * 동의어 정규화 (Canonical Name)
 */
export const EQUIPMENT_NORMALIZATION: Record<string, string> = {
    "호흡보호구": "송기마스크",
    "방독면": "방독마스크",
    "굴삭기": "굴착기",
    "신호수 장비": "신호수 장비(조끼/봉)",
    "라바콘": "바리케이드/콘",
};

const normalize = (name: string) => EQUIPMENT_NORMALIZATION[name] || name;

export interface ScoringContext {
    industry: string;
    workTypes: string[];
    riskFactors: string[];
}

/**
 * 추천 엔진: getRecommendedEquipments (Refined for Step 3 Overhaul)
 */
export const getRecommendedEquipments = (ctx: ScoringContext) => {
    const safeIndustry = (INDUSTRY_RULES[ctx.industry as IndustryKey] ? ctx.industry : "기타(직접입력)") as IndustryKey;
    const rule = INDUSTRY_RULES[safeIndustry];

    // 1. Must Items (Industry Specific + Global)
    const industryMust = (rule.equipments.must || []).map(normalize);
    const totalMust = uniq([...GLOBAL_MANDATORY_EQUIPMENT, ...industryMust]);
    const totalMustSet = new Set(totalMust);

    // 2. Situational Items (Based on ctx)
    const situationalSet = new Set<string>();
    [...ctx.workTypes, ...ctx.riskFactors].forEach(trigger => {
        if (SITUATIONAL_EQUIPMENT_RULES[trigger]) {
            SITUATIONAL_EQUIPMENT_RULES[trigger].forEach(item => {
                const name = normalize(item);
                if (!totalMustSet.has(name)) {
                    situationalSet.add(name);
                }
            });
        }
    });
    const situationalList = Array.from(situationalSet);

    // 3. Recommended Items
    const scoreMap: Record<string, number> = {};

    // Industry Recommendations
    (rule.equipments.recommend || []).forEach(item => {
        const name = normalize(item);
        if (!totalMustSet.has(name) && !situationalSet.has(name)) {
            scoreMap[name] = (scoreMap[name] || 0) + 100;
        }
    });

    // Sort and Cap Recommended at 8
    const sortedRecommended = Object.entries(scoreMap)
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(i => i.name);

    return {
        must: totalMust,
        recommended: sortedRecommended,
        situational: situationalList,
        extra: (commonEquipment || []).filter(e =>
            !totalMustSet.has(e) &&
            !situationalSet.has(e) &&
            !new Set(sortedRecommended).has(e)
        )
    };
};

export const buildStep2Lists = (industry: string, detailLocation: string = "") => {
    const safeIndustry = (INDUSTRY_RULES[industry as IndustryKey] ? industry : "기타(직접입력)") as IndustryKey;
    const rule = INDUSTRY_RULES[safeIndustry];

    const industryWT = rule.workTypes;
    const allowedBase = INDUSTRY_ALLOWED_HAZARDS[safeIndustry] ?? INDUSTRY_ALLOWED_HAZARDS["default"] ?? [];

    const hasCollapseKeyword = COLLAPSE_KEYWORDS.some(k => detailLocation.includes(k));
    const finalHazards = Array.isArray(allowedBase) ? allowedBase : [];

    return {
        workTypes: uniq([...industryWT, ...commonWorkTypes]),
        riskFactors: uniq(finalHazards),
        recommendedHazards: hasCollapseKeyword && finalHazards.includes("붕괴위험") ? ["붕괴위험"] : []
    };
};

export const buildStep3Checklist = (industry: string, selectedWT: string[], selectedRF: string[]) => {
    const safeIndustry = (INDUSTRY_RULES[industry as IndustryKey] ? industry : "기타(직접입력)") as IndustryKey;
    const rule = INDUSTRY_RULES[safeIndustry];

    return rule.requiredChecks.map((label, idx) => ({
        id: `rule_check_${idx}`,
        label,
        required: true,
        checked: true
    }));
};
