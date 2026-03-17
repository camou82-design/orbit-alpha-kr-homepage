// src/lib/semi/sanitize.ts
import { Equipment, getRules, IndustryKey, RiskFactor, WorkType } from "@/lib/semi/rules";

type Step2Data = { workTypes?: WorkType[]; riskFlags?: RiskFactor[] };
type Step3Data = {
    // 너 프로젝트에서 equipments 저장 구조가 다를 수 있어서 “안전하게” 처리
    equipments?: Equipment[];
    selectedRecommended?: Equipment[];
    selectedConditional?: Equipment[];
};

const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));

export function sanitizeStep2ByIndustry(industry: IndustryKey, step2: Step2Data): Step2Data {
    const rules = getRules(industry);
    const workTypes = (step2.workTypes ?? []).filter((x) => rules.allowedWorkTypes.has(x));
    const riskFlags = (step2.riskFlags ?? []).filter((x) => rules.allowedRisks.has(x));
    return { ...step2, workTypes: uniq(workTypes), riskFlags: uniq(riskFlags) };
}

export function sanitizeStep3ByIndustry(industry: IndustryKey, step3: Step3Data): Step3Data {
    const rules = getRules(industry);

    const equipments = (step3.equipments ?? []).filter((x) => rules.allowedEquipments.has(x));
    const selectedRecommended = (step3.selectedRecommended ?? []).filter((x) => rules.allowedEquipments.has(x));
    const selectedConditional = (step3.selectedConditional ?? []).filter((x) => rules.allowedEquipments.has(x));

    return {
        ...step3,
        equipments: uniq(equipments),
        selectedRecommended: uniq(selectedRecommended),
        selectedConditional: uniq(selectedConditional),
    };
}
