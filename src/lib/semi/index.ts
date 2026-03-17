// src/lib/semi/index.ts

export type { IndustryKey, IndustryGroup } from "./industryCatalog";
export {
    normalizeIndustry,
    getIndustryGroupLabel,
    INDUSTRY_OPTIONS,
    INDUSTRY_LABEL
} from "./industryCatalog";

export { INDUSTRY_RULES } from "./industryRules";

export {
    sanitizeStep2ByIndustry as pruneSelections, // 알리어스로 매핑 대기
    sanitizeStep3ByIndustry
} from "./sanitize";

export {
    getRules,
    COMMON_EQUIP_MUST,
    resolveIndustryKey,
    getChecklistForStep4,
    PROCESS_CHECK_RULES,
} from "./rules";
export type { ChecklistItem } from "./rules";

export {
    COMMON_WORKTYPES,
    COMMON_RISKFLAGS
} from "./constants";
