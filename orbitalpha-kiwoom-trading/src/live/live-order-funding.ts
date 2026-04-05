import type { MonitorAccountSummary } from "../infra/monitor-snapshot.js";

/** /live 스냅샷·로그용 */
export interface LiveOrderFundingSnapshot {
  /** 현금 예수금(entr) */
  cashKrw: number;
  /** D+2 추정 예수금(entr_d2) — 표시용; 주문 한도에 단독 사용하지 않음 */
  cashD2Krw: number;
  /** 실주문 가드 상한(미수불가 전용 필드 우선, 없으면 entr) */
  noMarginOrderCapKrw: number;
  /** 사용된 API 키 또는 entr_fallback / none */
  capSource: string;
  /** 기준 주문 필요 금액(원) */
  requiredKrw: number;
  /** 신용·미수 위험 신호(응답 필드 휴리스틱) */
  creditOrMarginRisk: boolean;
  fundingGateOk: boolean;
  reasonKo: string;
}

function isBadNum(n: number): boolean {
  return !Number.isFinite(n) || n < 0;
}

/** 응답 상단에 신용·대출 성격 필드가 명시되면 차단 */
export function detectCreditOrMarginRiskFromTop(
  rec: Record<string, unknown> | null | undefined
): boolean {
  if (!rec) return false;
  const checks: { key: string; bad: (v: unknown) => boolean }[] = [
    {
      key: "crdt_yn",
      bad: (v) => String(v).trim().toUpperCase() === "Y",
    },
    {
      key: "crd_tp",
      bad: (v) => {
        const t = String(v).trim().toUpperCase();
        return t === "Y" || t === "1" || t === "신용";
      },
    },
    {
      key: "loan_yn",
      bad: (v) => String(v).trim().toUpperCase() === "Y",
    },
  ];
  for (const { key, bad } of checks) {
    if (key in rec && bad(rec[key])) return true;
  }
  return false;
}

/**
 * 주문 직전: 미수불가 100% 상한(또는 entr 폴백) 내에서만 매수 허용.
 * 신용/미수 플래그가 있으면 무조건 차단.
 */
export function evaluateCashOnlyBuyFunding(input: {
  accountFetchOk: boolean;
  accountSummary: MonitorAccountSummary | undefined;
  requiredKrw: number;
  accountCreditRisk?: boolean;
}): LiveOrderFundingSnapshot {
  const s = input.accountSummary;
  const cashKrw = s ? Math.round(s.cashKrw) : 0;
  const cashD2Krw = s ? Math.round(s.cashD2Krw) : 0;
  const cap = s ? Math.round(s.noMarginOrderCapKrw) : 0;
  const capSource = s?.noMarginOrderCapSource ?? "none";
  const req = Math.max(0, Math.round(input.requiredKrw));
  const credit = Boolean(
    input.accountCreditRisk ?? s?.accountCreditRisk ?? false
  );

  const base: LiveOrderFundingSnapshot = {
    cashKrw,
    cashD2Krw,
    noMarginOrderCapKrw: cap,
    capSource,
    requiredKrw: req,
    creditOrMarginRisk: credit,
    fundingGateOk: false,
    reasonKo: "",
  };

  if (!input.accountFetchOk || !s) {
    return {
      ...base,
      reasonKo: "계좌 정보 미확인 상태로 실주문을 차단했습니다",
    };
  }

  if (credit) {
    return {
      ...base,
      reasonKo: "미수 발생 가능성으로 실주문 차단",
    };
  }

  if (isBadNum(cap) || isBadNum(cashKrw) || cap <= 0) {
    return {
      ...base,
      reasonKo: "주문 가능 금액 확인 실패로 실주문 차단",
    };
  }

  if (req <= 0) {
    return {
      ...base,
      fundingGateOk: true,
      reasonKo: "기준 주문 필요 금액 없음 (이번 틱 실주문 시도 없음)",
    };
  }

  if (req > cap) {
    return {
      ...base,
      fundingGateOk: false,
      reasonKo: "현금 및 미수불가 기준 주문 가능 금액 부족으로 실주문 차단",
    };
  }

  return {
    ...base,
    fundingGateOk: true,
    reasonKo: "미수불가 기준 주문 가능 범위 내입니다",
  };
}

export function snapshotToPlain(
  o: LiveOrderFundingSnapshot
): Record<string, unknown> {
  return { ...o };
}
