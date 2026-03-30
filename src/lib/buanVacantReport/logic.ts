import {
  CHECK_SCORES,
  type BasicInfo,
  type CheckLevel,
  type ChecklistAnswers,
  type ChecklistKey,
  type JudgmentBand,
  type ResultDetail,
} from "./types";

export function sumChecklistScore(answers: ChecklistAnswers): number {
  let total = 0;
  const keys: ChecklistKey[] = [
    "structure",
    "pollution",
    "electric",
    "access",
    "reuse",
  ];
  for (const k of keys) {
    const v = answers[k];
    if (v === null) continue;
    total += CHECK_SCORES[v];
  }
  return total;
}

export function isChecklistComplete(answers: ChecklistAnswers): boolean {
  return (
    answers.structure !== null &&
    answers.pollution !== null &&
    answers.electric !== null &&
    answers.access !== null &&
    answers.reuse !== null
  );
}

function bandFromScore(score: number): JudgmentBand {
  if (score <= 4) return "band0";
  if (score <= 8) return "band1";
  if (score <= 12) return "band2";
  if (score <= 16) return "band3";
  return "band4";
}

const JUDGMENT_BY_BAND: Record<JudgmentBand, string> = {
  band0: "즉시 활용 가능",
  band1: "경정리 후 활용 가능",
  band2: "중정비 후 활용 가능",
  band3: "대수선 검토 필요",
  band4: "철거 또는 전면 정비 권장",
};

function riskLevel(
  score: number,
  answers: ChecklistAnswers
): string {
  const struct = answers.structure === "bad";
  const elec = answers.electric === "bad";
  if (score >= 17) return "매우 높음";
  if (score >= 13 || struct || elec) return "높음";
  if (score >= 9) return "중간";
  if (score >= 5) return "중간";
  return "낮음";
}

function cleanupDifficulty(score: number): string {
  if (score <= 4) return "쉬움";
  if (score <= 8) return "보통";
  if (score <= 12) return "다소 어려움";
  if (score <= 16) return "어려움";
  return "매우 어려움";
}

function priorityActions(answers: ChecklistAnswers): string[] {
  const items: string[] = [];
  if (answers.structure === "bad") {
    items.push("구조·기초 안전을 전문가와 함께 확인하고, 출입 제한·안내 표지를 우선 정비합니다.");
  } else if (answers.structure === "normal") {
    items.push("균열·누수 등 세부 부위를 추가 점검해 보강 시기를 정합니다.");
  }
  if (answers.pollution === "bad") {
    items.push("폐기물 분리·반출과 내부 청소를 병행하고, 오염 원인(누수 등)을 차단합니다.");
  } else if (answers.pollution === "normal") {
    items.push("쓰레기·잡물 정리와 환기를 통해 사용 가능 면적을 확보합니다.");
  }
  if (answers.electric === "bad") {
    items.push("분전·배선 상태를 점검하고, 가설 전원 차단 후 합선·누전 위험을 제거합니다.");
  } else if (answers.electric === "normal") {
    items.push("노출 배선·콘센트 상태를 정비하고 필요 시 부분 교체를 검토합니다.");
  }
  if (answers.access === "bad") {
    items.push("출입로 정리, 계단·난간 보수로 안전한 동선을 먼저 확보합니다.");
  }
  if (answers.reuse === "bad") {
    items.push("용도 변경에 맞는 설비·단열·방수 계획을 수립합니다.");
  }
  if (items.length === 0) {
    items.push("정기 점검 일정을 정하고, 소모성 부위(창호·배관)만 순차 교체합니다.");
  }
  return items.slice(0, 5);
}

function reuseRecommendation(
  score: number,
  basic: BasicInfo,
  answers: ChecklistAnswers
): string {
  const space = basic.spaceType;
  const band = bandFromScore(score);

  if (band === "band4") {
    return "부지 정리·신축 또는 완전 리모델링 후 용도 재설정(주거·창고·시설 등)";
  }
  if (band === "band3") {
    return `${space || "해당 공간"} 기준 대수선 후 주거·소규모 상업·창고 등 복합 검토`;
  }
  if (answers.reuse === "good" && score <= 8) {
    return "단기 임대·체험·소규모 커뮤니티·작업장 등 가벼운 프로그램 적합";
  }
  if (space.includes("농") || space.includes("부속")) {
    return "농가 부속 공간·저장·작업장·교육 공간으로의 단계적 활용";
  }
  if (space.includes("창고")) {
    return "저장·물류·작업 공간으로 정비 후 활용";
  }
  if (space.includes("공공") || space.includes("유휴")) {
    return "지역 커뮤니티·소규모 공유 시설로의 전환 검토";
  }
  return "주거·소규모 임대·창고형 용도를 우선 검토하고, 사업성에 따라 단계 확대";
}

function workScope(score: number, band: JudgmentBand): string {
  if (band === "band0") {
    return "청소·소모품 교체 수준. 구조·전기는 현 상태 유지 점검만으로 충분한 경우가 많습니다.";
  }
  if (band === "band1") {
    return "내부 정리, 일부 마감 보수, 배선·설비 부분 정비, 창호·방수 경미 수선.";
  }
  if (band === "band2") {
    return "전실·방수·전기·배관 중심의 중규모 수선, 폐기물 처리 및 동선 개선 포함.";
  }
  if (band === "band3") {
    return "골조 보강, 전기·설비 재구성, 내부 전면 마감, 외장·개폐부 정비 등 대규모 공사.";
  }
  return "해체·기초 정비부터 신축 또는 전면 재구성에 준하는 범위가 필요할 수 있습니다.";
}

function costRange(score: number): string {
  if (score <= 4) return "약 300만~800만 원(경미 정비·청소 중심)";
  if (score <= 8) return "약 800만~2,000만 원(부분 수선·설비)";
  if (score <= 12) return "약 2,000만~5,000만 원(중규모 리모델)";
  if (score <= 16) return "약 5,000만~1억 5천만 원 이상(대수선·구조 보강)";
  return "약 1억 원 이상 또는 철거·신축 별도 검토";
}

function buildSummary(
  basic: BasicInfo,
  score: number,
  judgment: string,
  answers: ChecklistAnswers
): string {
  const name = basic.siteName.trim() || "해당 현장";
  const weak: string[] = [];
  if (answers.structure === "bad") weak.push("구조");
  if (answers.pollution === "bad") weak.push("오염·폐기물");
  if (answers.electric === "bad") weak.push("전기·설비");
  if (answers.access === "bad") weak.push("출입·동선");
  if (answers.reuse === "bad") weak.push("재사용 조건");

  const weakText =
    weak.length > 0
      ? ` 특히 ${weak.join(", ")} 항목에서 보완이 필요합니다.`
      : " 전반적으로 정비 부담이 크지 않은 편입니다.";

  return `${name}은(는) 체크리스트 총점 ${score}점 기준으로 「${judgment}」에 해당합니다.${weakText} 현장 메모와 사진을 함께 관리하면 이후 설계·공사 범위 협의에 도움이 됩니다.`;
}

export function buildResultDetail(
  basic: BasicInfo,
  answers: ChecklistAnswers
): ResultDetail | null {
  if (!isChecklistComplete(answers)) return null;
  const filled = answers as Record<ChecklistKey, CheckLevel>;
  const totalScore =
    (["structure", "pollution", "electric", "access", "reuse"] as const).reduce(
      (acc, k) => acc + CHECK_SCORES[filled[k]],
      0
    );

  const band = bandFromScore(totalScore);
  const judgmentLabel = JUDGMENT_BY_BAND[band];

  return {
    totalScore,
    judgmentLabel,
    band,
    riskLevel: riskLevel(totalScore, answers),
    cleanupDifficulty: cleanupDifficulty(totalScore),
    priorityActions: priorityActions(answers),
    reuseRecommendation: reuseRecommendation(totalScore, basic, answers),
    workScope: workScope(totalScore, band),
    costRange: costRange(totalScore),
    summary: buildSummary(basic, totalScore, judgmentLabel, answers),
  };
}
