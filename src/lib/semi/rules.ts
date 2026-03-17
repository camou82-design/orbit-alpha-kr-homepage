// src/lib/semi/rules.ts

import { COMMON_MUST_CHECKS, INDUSTRY_RULES } from "./industryRules";
import { IndustryKey, IndustryGroup, getIndustryGroupLabel } from "./industryCatalog";

/* ===========================
   타입 정의
   =========================== */

export type WorkType = string;
export type RiskFactor = string;
export type Equipment = string;

export type ChecklistItem = {
    label: string;
    required: boolean;   // 공통 4개만 true로 쓰자
    fixed: boolean;      // ✅ 삭제/해제 불가 여부
    source: "common" | "workType" | "risk" | "industry";
};

/* ===========================
   공통 필수 항목 및 고정 항목
   =========================== */

export const FIXED_COMMON_4 = [
    "작업허가/작업계획 확인",
    "TBM(작업 전 위험성 평가) 실시",
    "출입통제/표지/동선 분리",
    "비상대응(연락/대피/소화) 확인",
] as const;

export const COMMON_EQUIP_MUST: readonly Equipment[] = [
    "안전모",
    "안전화",
    "안전조끼",
    "보안경",
    "장갑",
];

/* ===========================
   대분류 및 세부키 정규화/해결
   =========================== */

/**
 * 입력값을 IndustryGroup 타입으로 안전하게 변환
 */
export function normalizeIndustryGroup(input: any): IndustryGroup {
    return getIndustryGroupLabel(input) as IndustryGroup;
}

/**
 * 입력값을 IndustryKey 타입으로 안전하게 변환
 */
export function normalizeIndustry(input: any): IndustryKey {
    // INDUSTRY_RULES의 키 중 하나인지 확인하거나, 기본값으로 처리
    if (typeof input === 'string' && Object.keys(INDUSTRY_RULES).includes(input)) {
        return input as IndustryKey;
    }
    return "기타(직접입력)"; // 유효하지 않은 경우 기본값 반환
}

/**
 * [Pattern B] 직종(IndustryKey)이 이미 Step1에서 결정되었으므로 그대로 반환.
 * 하위 호환을 위해 args 구조는 유지.
 */
export function resolveIndustryKey(args: { industry: any }): IndustryKey {
    return normalizeIndustry(args.industry);
}



/* ===========================
   핵심 Rules 반환
   =========================== */

export function getRules(industry: IndustryKey) {
    const rule =
        (INDUSTRY_RULES as any)[industry] ??
        (INDUSTRY_RULES as any)["기타(직접입력)"];

    const allowedWorkTypes = new Set<WorkType>([
        ...(rule.workTypes ?? []),
    ]);

    const allowedRisks = new Set<RiskFactor>([
        ...(rule.hazards ?? []),
    ]);

    const must = [
        ...(rule.equipments?.must ?? []),
    ];

    const recommend = [
        ...(rule.equipments?.recommend ?? []),
    ];

    const optional = [
        ...(rule.equipments?.optional ?? []),
    ];

    const allowedEquipments = new Set<Equipment>([
        ...must,
        ...recommend,
        ...optional,
    ]);

    return {
        allowedWorkTypes,
        allowedRisks,
        allowedEquipments,
        recommendEquipments: recommend,
        mustEquipments: must,
        requiredChecks: rule.requiredChecks ?? [],
    };
}

// 작업유형/위험요소 -> 체크리스트 매칭
export const PROCESS_CHECK_RULES: Record<string, string[]> = {
    "굴착": [
        "굴착면/흙막이 붕괴 점검",
        "매설물(전기/가스) 확인",
        "출입 통제/표지",
        "우천/배수 상태 확인",
    ],
    "트렌치": [
        "트렌치 붕괴 위험(사면/토질) 점검",
        "굴착부 난간/덮개/야간조명 확보",
        "맨홀/밀폐 공간 여부 확인(필요 시 가스측정)",
    ],
    "되메우기": [
        "장비 동선/반경 통제 및 신호수",
        "후진 동선 유도/유도자 배치",
        "다짐 장비 접근 통제",
    ],
    "배수": [
        "배수 상태/침수 위험 확인",
        "양수기/배수로 확보",
        "전기 사용 시 누전/감전 예방(차단기/접지)",
    ],
    "흙막이/버팀": [
        "흙막이/버팀 설치 상태 및 변형 여부",
        "버팀재 체결/볼트 풀림 점검",
        "굴착 주변 상부 적치물/하중 제거",
    ],
    "관로/맨홀": [
        "가스측정(산소/유해가스) 및 환기",
        "구조·구난(삼각대/구명줄) 준비",
        "감시인 배치(상부)",
    ],
};

// 위험요소 -> 체크리스트 매칭
export const RISK_CHECK_MAP: Record<string, string[]> = {
    "붕괴위험": [
        "굴착면/흙막이 붕괴 점검",
        "굴착면 붕괴 위험 구간 접근 금지",
        "상부 적치물/하중 제거 및 이격",
    ],
    "장비반입": [
        "장비 회전반경/후진동선 출입통제",
        "신호수 배치 및 수신호 통일",
    ],
    "협착위험": [
        "협착 위험 구간 접근 금지/작업자 위치 통제",
        "장비-작업자 동선 분리",
    ],
    "낙하/비래": [
        "상부 작업/낙하물 위험 구간 통제",
        "하부 출입 통제 및 표지",
    ],
    "추락위험": [
        "개구부/굴착부 난간·덮개 설치",
        "야간 조명 확보",
    ],
    "미끄럼": [
        "통로 정리/미끄럼 방지(슬러리/진흙)",
        "배수/정리정돈 유지",
    ],
};

const norm = (s: string) => s.replace(/\s+/g, "").replace(/[()\/]/g, "").toLowerCase();

function dedupeByLabel(items: ChecklistItem[]): ChecklistItem[] {
    const merged = new Map<string, ChecklistItem>();

    for (const it of items) {
        const k = norm(it.label);
        const prev = merged.get(k);
        if (!prev) {
            merged.set(k, it);
        } else {
            merged.set(k, {
                ...it,
                fixed: prev.fixed || it.fixed,
                required: prev.required || it.required,
            });
        }
    }
    return Array.from(merged.values());
}

/**
 * Step4 체크리스트 생성기
 */
export function getChecklistForStep4(params: {
    industry: IndustryKey | "";
    workTypes: string[];
    riskFlags: string[];
}): ChecklistItem[] {
    const { industry, workTypes, riskFlags } = params;

    const items: ChecklistItem[] = [];

    // ✅ 1) 공통 필수 4개 (fixed/required)
    FIXED_COMMON_4.forEach((label) => {
        items.push({ label, required: true, fixed: true, source: "common" });
    });

    // ✅ 2) 업종 기반 (선택 취급)
    if (industry && (INDUSTRY_RULES as any)[industry]) {
        const rule = (INDUSTRY_RULES as any)[industry];
        const req: string[] = Array.isArray(rule?.requiredChecks) ? rule.requiredChecks : [];
        req.forEach((label) => {
            if (!FIXED_COMMON_4.includes(label as any)) {
                items.push({ label, required: false, fixed: false, source: "industry" });
            }
        });
    }

    // ✅ 3) 작업유형 기반 (선택)
    (workTypes || []).forEach((wt) => {
        const list = PROCESS_CHECK_RULES[wt];
        if (list?.length) {
            list.forEach((label) => {
                if (!FIXED_COMMON_4.includes(label as any)) {
                    items.push({ label, required: false, fixed: false, source: "workType" });
                }
            });
        }
    });

    // ✅ 4) 위험요소 기반 (선택)
    (riskFlags || []).forEach((rf) => {
        const list = RISK_CHECK_MAP[rf];
        if (list?.length) {
            list.forEach((label) => {
                if (!FIXED_COMMON_4.includes(label as any)) {
                    items.push({ label, required: false, fixed: false, source: "risk" });
                }
            });
        }
    });

    return dedupeByLabel(items);
}
