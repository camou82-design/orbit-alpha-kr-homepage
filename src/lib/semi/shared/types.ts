// src/lib/semi/shared/types.ts

export type WorkType = string;
export type RiskFactor = string;
export type Equipment = string;

export type IndustryGroup = "토목/토공" | "건축" | "기타(직접입력)";

export type ChecklistItem = {
    label: string;
    required: boolean;
    fixed: boolean;
    source: "common" | "workType" | "risk" | "industry";
};

export interface Step1Data {
    workArea: string;
    detailLocation: string;
    vendor: string;
    industry: string;
    crewCount: number; // ✅ people -> crewCount (number)
}

export interface Step2Data {
    workTypes: string[];
    riskFlags: string[];
}

export interface Step3Data {
    equipments: string[];
}

export interface Step4Data {
    safetyChecks: {
        id: string;
        label: string;
        required: boolean;
        fixed: boolean;
        checked: boolean;
    }[];
    uncheckedAdds: string[];
}

export interface SubmissionDTO {
    step1: Step1Data;
    step2: Step2Data;
    step3: Step3Data;
    step4: Step4Data;
    confirmed: boolean;
}

export interface ScoringResult {
    level: "CRITICAL" | "HIGH" | "MID" | "LOW";
    finalScore: number;
    breakdown: {
        base: number;
        crewPts: number;
        workTypePts: number;
        riskFlagPts: number;
        equipPts: number;
        missPts: number;
    };
    uncheckedAdds: string[];
    timestamp: string;
}

export interface FinalSubmission extends SubmissionDTO {
    id: string;
    timestamp: string;
    evaluation: ScoringResult;
}
