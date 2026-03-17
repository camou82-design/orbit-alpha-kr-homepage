export interface IndustryRule {
    recommendedWorkTypes: string[];
    recommendedRisks: string[];
    recommendedEquipments: string[];
    mandatoryRoles: string[];
}

export const industryRules: Record<string, IndustryRule> = {
    "전기/계장": {
        recommendedWorkTypes: ["고소작업"],
        recommendedRisks: ["감전위험"],
        recommendedEquipments: [],
        mandatoryRoles: []
    },
    "배관/덕트": {
        recommendedWorkTypes: ["고소작업", "화기작업", "중량물 취급"],
        recommendedRisks: ["추락위험"],
        recommendedEquipments: ["용접기"],
        mandatoryRoles: ["화재감시자"]
    },
    "설비반입": {
        recommendedWorkTypes: ["중량물 취급"],
        recommendedRisks: [],
        recommendedEquipments: ["크레인", "지게차"],
        mandatoryRoles: ["신호수"]
    },
    "가스라인": {
        recommendedWorkTypes: ["밀폐공간"],
        recommendedRisks: ["유해화학물질"],
        recommendedEquipments: [],
        mandatoryRoles: ["감시자"]
    },
    "클린룸 작업": {
        recommendedWorkTypes: [],
        recommendedRisks: ["미끄럼위험"],
        recommendedEquipments: [],
        mandatoryRoles: []
    },
    "HVAC": {
        recommendedWorkTypes: ["고소작업", "화기작업"],
        recommendedRisks: ["추락위험"],
        recommendedEquipments: [],
        mandatoryRoles: ["화재감시자"]
    },
    "토목/굴착": {
        recommendedWorkTypes: ["밀폐공간", "중량물 취급"],
        recommendedRisks: ["붕괴위험"],
        recommendedEquipments: ["굴착기"],
        mandatoryRoles: ["신호수"]
    },
    "건설/형틀(거푸집)": {
        recommendedWorkTypes: ["고소작업", "중량물 취급"],
        recommendedRisks: ["추락위험"],
        recommendedEquipments: ["타워크레인", "굴삭기", "고소작업대"],
        mandatoryRoles: ["신호수"]
    },
    "건설/철근콘크리트": {
        recommendedWorkTypes: ["고소작업", "중량물 취급", "단위작업"],
        recommendedRisks: ["추락위험"],
        recommendedEquipments: ["타워크레인", "굴삭기"],
        mandatoryRoles: ["신호수"]
    },
    "내장/석고보드·경량철골(LGS)": {
        recommendedWorkTypes: ["고소작업", "단위작업"],
        recommendedRisks: ["추락위험"],
        recommendedEquipments: ["이동식비계", "사다리"],
        mandatoryRoles: []
    },
    "내장/도장": {
        recommendedWorkTypes: ["단위작업"],
        recommendedRisks: ["유해화학물질"],
        recommendedEquipments: ["환기팬(이동식)", "방진마스크"],
        mandatoryRoles: []
    },
    "내장/타일·석재": {
        recommendedWorkTypes: ["중량물 취급", "단위작업"],
        recommendedRisks: ["낙하/비래", "절단/비산"],
        recommendedEquipments: ["절단기", "운반구(대차)"],
        mandatoryRoles: []
    },
    "내장/바닥(데코타일·에폭시)": {
        recommendedWorkTypes: ["단위작업"],
        recommendedRisks: ["유해화학물질", "미끄럼"],
        recommendedEquipments: ["환기팬(이동식)"],
        mandatoryRoles: []
    },
    "내장/천장(T-Bar·텍스)": {
        recommendedWorkTypes: ["고소작업", "단위작업"],
        recommendedRisks: ["추락위험", "낙하/비래"],
        recommendedEquipments: ["이동식비계", "사다리"],
        mandatoryRoles: []
    },
    "내장/유리·샤시": {
        recommendedWorkTypes: ["중량물 취급", "고소작업"],
        recommendedRisks: ["절단/비산", "추락위험"],
        recommendedEquipments: ["흡착기(유리)", "대차"],
        mandatoryRoles: []
    },
    "내장/단열·방수": {
        recommendedWorkTypes: ["고소작업", "화기작업"],
        recommendedRisks: ["화재위험", "추락위험"],
        recommendedEquipments: ["토치", "소화기"],
        mandatoryRoles: ["화재감시자"]
    },
    "내장/목공": {
        recommendedWorkTypes: ["단위작업"],
        recommendedRisks: ["절단/비산", "화재위험"],
        recommendedEquipments: ["톱(절단)", "소화기"],
        mandatoryRoles: []
    },
    "기타": {
        recommendedWorkTypes: [],
        recommendedRisks: [],
        recommendedEquipments: [],
        mandatoryRoles: []
    }
};
