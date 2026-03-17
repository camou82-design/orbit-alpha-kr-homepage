// src/lib/semi/server/scoring.ts

import { SubmissionDTO, ScoringResult } from "../shared/types";

// ✅ [민감 설정] 서버에서만 관리하는 가중치 및 임계값
const WEIGHTS = {
    crew: [37, 23, 14, 7, 3], // 21+16 / 11+12 / 6+8 / 3+4 / 1+2 합산 추정 (유저 A값 기반)
    workType: 4,
    riskFlag: 9,
    miss: 12
};

const THRESHOLDS = {
    CRITICAL: 70,
    HIGH: 45,
    MID: 20
};

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function levelFromScore(score: number): ScoringResult["level"] {
    if (score >= THRESHOLDS.CRITICAL) return "CRITICAL";
    if (score >= THRESHOLDS.HIGH) return "HIGH";
    if (score >= THRESHOLDS.MID) return "MID";
    return "LOW";
}

export function evaluateSemi(data: SubmissionDTO): ScoringResult {
    const { step1, step2, step3, step4 } = data;

    // 1. 인원 점수
    const n = step1.crewCount || 0; // ✅ step2 -> step1
    let crewPts = 3;
    if (n >= 100) crewPts = WEIGHTS.crew[0];
    else if (n >= 50) crewPts = WEIGHTS.crew[1];
    else if (n >= 20) crewPts = WEIGHTS.crew[2];
    else if (n >= 10) crewPts = WEIGHTS.crew[3];
    else crewPts = WEIGHTS.crew[4];

    // 2. 공정/위험 점수
    const workTypePts = (step2.workTypes?.length || 0) * WEIGHTS.workType;
    const riskFlagPts = (step2.riskFlags?.length || 0) * WEIGHTS.riskFlag;

    // 3. 장비 점수 (가점 성격 - 실제로는 페널티 상쇄나 복잡도 반영)
    const equipPts = (step3.equipments?.length || 0) * 1.5;

    // 4. 미체크 페널티
    const uncheckedAdds = step4.uncheckedAdds || [];
    const missPts = uncheckedAdds.length * WEIGHTS.miss;

    // 5. 최종 합산
    const base = 10; // 기본 위험도
    const rawTotal = base + crewPts + workTypePts + riskFlagPts + missPts - Math.floor(equipPts);
    const finalScore = clamp(rawTotal, 0, 100);

    return {
        level: levelFromScore(finalScore),
        finalScore,
        breakdown: {
            base,
            crewPts,
            workTypePts,
            riskFlagPts,
            equipPts: Math.floor(equipPts),
            missPts
        },
        uncheckedAdds,
        timestamp: new Date().toISOString()
    };
}
