/**
 * `npm run selfcheck:funding` — 미수불가·현금 주문 가드 단위 검증 (브로커 없음).
 */
import assert from "node:assert/strict";
import type { MonitorAccountSummary } from "../infra/monitor-snapshot.js";
import { evaluateCashOnlyBuyFunding } from "./live-order-funding.js";

function baseSummary(
  overrides: Partial<MonitorAccountSummary> = {}
): MonitorAccountSummary {
  return {
    totalEvalKrw: 0,
    totalCostKrw: 0,
    totalEvalPnlKrw: 0,
    totalReturnPct: 0,
    totalNetPnlKrw: 0,
    cashKrw: 1_000_000,
    cashD1Krw: 0,
    cashD2Krw: 2_000_000,
    paymentAvailableKrw: 0,
    orderAvailableKrw: 0,
    totReBuyOrderAllowableKrw: 0,
    noMarginOrderCapKrw: 500_000,
    noMarginOrderCapSource: "test",
    accountCreditRisk: false,
    ...overrides,
  };
}

let failed = 0;

function case_(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}`, e);
  }
}

case_("허용: 필요금액 <= 미수불가 상한", () => {
  const r = evaluateCashOnlyBuyFunding({
    accountFetchOk: true,
    accountSummary: baseSummary(),
    requiredKrw: 400_000,
  });
  assert.equal(r.fundingGateOk, true);
});

case_("차단: 필요금액 > 상한", () => {
  const r = evaluateCashOnlyBuyFunding({
    accountFetchOk: true,
    accountSummary: baseSummary(),
    requiredKrw: 600_000,
  });
  assert.equal(r.fundingGateOk, false);
  assert.ok(r.reasonKo.includes("부족"));
});

case_("차단: 신용 플래그", () => {
  const r = evaluateCashOnlyBuyFunding({
    accountFetchOk: true,
    accountSummary: baseSummary({ accountCreditRisk: true }),
    requiredKrw: 1,
  });
  assert.equal(r.fundingGateOk, false);
  assert.ok(r.reasonKo.includes("미수 발생 가능성"));
});

case_("차단: 계좌 조회 실패", () => {
  const r = evaluateCashOnlyBuyFunding({
    accountFetchOk: false,
    accountSummary: baseSummary(),
    requiredKrw: 1,
  });
  assert.equal(r.fundingGateOk, false);
});

case_("차단: 상한 0 (미확인)", () => {
  const r = evaluateCashOnlyBuyFunding({
    accountFetchOk: true,
    accountSummary: baseSummary({ noMarginOrderCapKrw: 0 }),
    requiredKrw: 1,
  });
  assert.equal(r.fundingGateOk, false);
  assert.ok(r.reasonKo.includes("확인 실패"));
});

case_("허용: 이번 틱 주문 없음(required 0)이고 상한 정상", () => {
  const r = evaluateCashOnlyBuyFunding({
    accountFetchOk: true,
    accountSummary: baseSummary(),
    requiredKrw: 0,
  });
  assert.equal(r.fundingGateOk, true);
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall funding selfchecks passed");
