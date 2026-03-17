export type Severity = "RED" | "AMBER";

export type Trigger = {
    code: string;
    title: string;
    severity: Severity;
    reason: string;
    actions: string[]; // 짧게
};

export type TriggerInput = {
    workArea: string; // FAB / CUB / 발전소 등
    workTypes: string[]; // 예: ["크레인 작업","고소작업"]
    riskFlags: string[]; // 예: ["가스/케미컬","전기","밀폐공간","화기"]
    crewCount: number; // 0 이상
    checklistRate: number; // 0~1
};

export type TriggerResult = {
    hasCritical: boolean;
    triggers: Trigger[];
};

function norm(s: string) {
    return (s ?? "").trim();
}
function has(list: string[], key: string) {
    const k = norm(key);
    return (list ?? []).some((v) => norm(v) === k);
}
function hasAny(list: string[], keys: string[]) {
    return keys.some((k) => has(list, k));
}
function clamp01(n: number) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

export function runTriggerEngine(input: TriggerInput): TriggerResult {
    const workTypes = input?.workTypes ?? [];
    const riskFlags = input?.riskFlags ?? [];
    const crewCount = Number.isFinite(input?.crewCount) ? input.crewCount : 0;
    const rate = clamp01(input?.checklistRate ?? 0);

    const triggers: Trigger[] = [];

    // -------------------------
    // RED 조건 (하이닉스 신축 스타일)
    // -------------------------

    // T1: 크레인/중량물 + 고소
    if (
        (hasAny(riskFlags, ["중량물/크레인"]) || hasAny(workTypes, ["크레인 작업", "중량물"])) &&
        hasAny(riskFlags, ["고소작업"]) // riskFlags에 고소를 쓰는 경우
    ) {
        triggers.push({
            code: "CRANE_HEIGHT",
            title: "크레인+고소 복합위험",
            severity: "RED",
            reason: "중량물 이동 중 추락/전도 위험",
            actions: ["신호수 배치", "작업반경 출입통제", "안전대 2점 고정"],
        });
    }

    // T2: 가스/케미컬 + 화기
    if (hasAny(riskFlags, ["가스/케미컬"]) && hasAny(riskFlags, ["화기"])) {
        triggers.push({
            code: "GAS_HOTWORK",
            title: "가스+화기 폭발위험",
            severity: "RED",
            reason: "누출/잔류가스 + 화기 작업",
            actions: ["가스농도 측정", "화기허가서 확인", "소화기/감시자 배치"],
        });
    }

    // T3: 전기 + 밀폐공간
    if (hasAny(riskFlags, ["전기"]) && hasAny(riskFlags, ["밀폐공간"])) {
        triggers.push({
            code: "ELECTRIC_CONFINED",
            title: "전기+밀폐 감전/질식",
            severity: "RED",
            reason: "환기 불량 + 감전/아크 위험",
            actions: ["무전압 확인", "환기/측정", "감시자 상주"],
        });
    }

    // T4: 중량물/크레인 + 다수인원
    if ((hasAny(riskFlags, ["중량물/크레인"]) || hasAny(workTypes, ["크레인 작업", "중량물"])) && crewCount >= 10) {
        triggers.push({
            code: "HEAVY_CROWD",
            title: "중량물+다수인원 통제필요",
            severity: "RED",
            reason: "동시작업/혼재로 충돌·낙하 위험",
            actions: ["작업구역 분리", "동시작업 조정", "유도원 배치"],
        });
    }

    // T5: 고위험 2개 이상 + 체크리스트 미흡
    const highRiskCount = [
        hasAny(riskFlags, ["중량물/크레인"]) || hasAny(workTypes, ["크레인 작업", "중량물"]),
        hasAny(riskFlags, ["고소작업"]),
        hasAny(riskFlags, ["가스/케미컬"]),
        hasAny(riskFlags, ["화기"]),
        hasAny(riskFlags, ["전기"]),
        hasAny(riskFlags, ["밀폐공간"]),
    ].filter(Boolean).length;

    if (highRiskCount >= 2 && rate < 0.7) {
        triggers.push({
            code: "LOW_CHECK_HIGH_RISK",
            title: "체크 미흡 + 고위험 다중",
            severity: "RED",
            reason: "필수 확인 누락 가능성 높음",
            actions: ["필수 체크 완료 후 진행", "허가서/LOTO 재확인", "감시단 재점검"],
        });
    }

    // -------------------------
    // AMBER 조건 (2개까지 예시)
    // -------------------------
    if (hasAny(riskFlags, ["고소작업"]) && rate < 0.8) {
        triggers.push({
            code: "HEIGHT_LOW_CHECK",
            title: "고소 체크 미흡",
            severity: "AMBER",
            reason: "추락방지 확인 부족",
            actions: ["안전대/난간 확인", "개구부 커버", "낙하물 방지"],
        });
    }

    if (hasAny(riskFlags, ["전기"]) && rate < 0.8) {
        triggers.push({
            code: "ELECTRIC_LOW_CHECK",
            title: "전기 체크 미흡",
            severity: "AMBER",
            reason: "감전 예방 확인 부족",
            actions: ["차단기/표찰", "절연구/접지", "무전압 확인"],
        });
    }

    const hasCritical = triggers.some((t) => t.severity === "RED");

    // ✅ JSON 순수(함수/Date/순환참조 금지) 보장 위해 1회 정화
    const safe = JSON.parse(JSON.stringify({ hasCritical, triggers })) as TriggerResult;
    return safe;
}
