export type CheckLevel = "good" | "normal" | "bad";

export const CHECK_LABELS: Record<CheckLevel, string> = {
  good: "양호",
  normal: "보통",
  bad: "불량",
};

export const CHECK_SCORES: Record<CheckLevel, number> = {
  good: 0,
  normal: 2,
  bad: 4,
};

export type ChecklistKey =
  | "structure"
  | "pollution"
  | "electric"
  | "access"
  | "reuse";

export const CHECKLIST_ITEMS: { key: ChecklistKey; label: string }[] = [
  { key: "structure", label: "구조 안전" },
  { key: "pollution", label: "내부 오염·폐기물" },
  { key: "electric", label: "전기·설비 상태" },
  { key: "access", label: "출입·접근 상태" },
  { key: "reuse", label: "재사용 가능성" },
];

export type BasicInfo = {
  siteName: string;
  address: string;
  spaceType: string;
  requestType: string;
  currentStatus: string;
  memo: string;
  /** data URLs (compressed JPEG) */
  photos: string[];
};

export type ChecklistAnswers = Record<ChecklistKey, CheckLevel | null>;

export const emptyBasicInfo = (): BasicInfo => ({
  siteName: "",
  address: "",
  spaceType: "",
  requestType: "",
  currentStatus: "",
  memo: "",
  photos: [],
});

export const emptyChecklist = (): ChecklistAnswers => ({
  structure: null,
  pollution: null,
  electric: null,
  access: null,
  reuse: null,
});

export type JudgmentBand =
  | "band0"
  | "band1"
  | "band2"
  | "band3"
  | "band4";

export type ResultDetail = {
  totalScore: number;
  judgmentLabel: string;
  band: JudgmentBand;
  riskLevel: string;
  cleanupDifficulty: string;
  priorityActions: string[];
  reuseRecommendation: string;
  workScope: string;
  costRange: string;
  summary: string;
};

export type SavedReport = {
  id: string;
  diagnosedAt: string;
  basic: BasicInfo;
  checklist: Record<ChecklistKey, CheckLevel>;
  totalScore: number;
  judgmentLabel: string;
  reuseRecommendation: string;
  result: ResultDetail;
};
