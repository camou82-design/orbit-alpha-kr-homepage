/**
 * 운영자용 LIVE 모니터 상단 배너 (스냅샷 + live-ops-state + 운영 가드).
 */

import type { AppConfig } from "./config.js";
import {
  inferRealOrderEligibleFromEngineMirror,
  type LiveOpsStateFile,
} from "../live/live-ops-state.js";
import {
  evaluateLiveOperationalOrderGate,
  liveOpsEnvWarningsForBanner,
} from "../live/live-ops-guard.js";

export type LiveOpsOrderState = "가능" | "제한" | "차단";

export interface LiveOpsBannerModel {
  overallState: "주문 가능" | "제한됨" | "차단됨";
  realOrderYesNo: "YES" | "NO" | "—";
  blockReasonLine: string;
  sessionMarket: "정규장" | "장외" | "미확인" | "상태 정보 부족";
  accountLookup: "정상" | "실패" | "미확인";
  quoteReceive: "정상" | "지연" | "실패" | "미확인";
  liveConfigOnOff: "ON" | "OFF" | "상태 정보 부족";
  actualOrderState: LiveOpsOrderState;
}

export function mergeMonitorDataWithEngineMirror(
  data: Record<string, unknown> | null,
  ops: LiveOpsStateFile
): { merged: Record<string, unknown> | null; dataIncomplete: boolean } {
  const m = ops.engineMirror;
  const out: Record<string, unknown> = { ...(data ?? {}) };
  const cl = { ...((out.configLoaded as Record<string, unknown>) ?? {}) };
  if (m) {
    if (typeof m.liveTradingEnabled === "boolean") {
      cl.liveTradingEnabled = m.liveTradingEnabled;
    }
    if (typeof m.liveConfirmationRequired === "boolean") {
      cl.liveConfirmationRequired = m.liveConfirmationRequired;
    }
    if (m.effectiveSessionPhase) {
      const prev = (out.marketSessionDetected as Record<string, unknown> | undefined) ?? {};
      out.marketSessionDetected = {
        ...prev,
        effectiveSessionPhase: m.effectiveSessionPhase,
        forcedSessionPhase: m.forcedSessionPhase,
        msg: typeof prev.msg === "string" ? prev.msg : "detected",
      };
    }
    if (typeof m.realOrderEligible === "boolean") {
      out.liveTestOrderEligible = m.realOrderEligible;
    } else {
      const inferred = inferRealOrderEligibleFromEngineMirror(m);
      out.liveTestOrderEligible = inferred;
    }
    if (out.liveTestOrderEligible === true) {
      out.liveTestOrderBlockReasons = [];
    } else if (Array.isArray(m.testBlockReasons)) {
      out.liveTestOrderBlockReasons = m.testBlockReasons;
    }
    if (Array.isArray(m.blockReasons)) {
      out.dryRunBlockReasons = m.blockReasons;
    }
    out.configLoaded = cl;
  } else {
    out.configLoaded = cl;
  }

  const clFinal = out.configLoaded as Record<string, unknown> | undefined;
  const hasTradingFlag = typeof clFinal?.liveTradingEnabled === "boolean";
  const dataIncomplete =
    !hasTradingFlag &&
    typeof m?.liveTradingEnabled !== "boolean";
  return { merged: out, dataIncomplete };
}

export interface LiveOpsExtendedBanner {
  killSwitchLine: string;
  ordersToday: string;
  ordersMax: string;
  ordersRemaining: string;
  dailyPnlLine: string;
  lossLimitLine: string;
  opsBlockedLine: string;
  reentryLine: string;
  lastAttempt: string;
  lastSuccess: string;
  lastFailure: string;
  /** 미수불가·현금 기준 주문 가드 (/live 스냅샷 liveOrderFunding) */
  fundingCashLine: string;
  fundingD2Line: string;
  fundingNoMarginCapLine: string;
  fundingCapSourceLine: string;
  fundingRequiredLine: string;
  fundingGateYesNo: string;
  fundingReasonLine: string;
}

const REASON_KO: Record<string, string> = {
  live_trading_disabled: "LIVE 전략 게이트가 꺼져 있어 실주문 경로가 닫혀 있습니다",
  role_not_trader: "트레이더 권한이 없습니다",
  live_not_confirmed: "라이브 거래 확인이 완료되지 않았습니다",
  daily_loss_limit: "일일 손실 한도에 도달했습니다",
  order_size_limit: "주문 크기 한도를 초과합니다",
  max_open_positions: "최대 보유 종목 수에 도달했습니다",
  not_regular_session: "정규장이 아니어서 테스트 실주문이 차단됩니다",
  session_phase_forced_dev_not_allowed_for_live_test: "개발용 장세션 강제 설정으로 테스트 주문이 차단됩니다",
  oauth_failed_before_order: "키움 인증(토큰)에 실패했습니다",
  live_test_order_disabled: "테스트 실주문 환경 설정이 꺼져 있습니다",
  live_test_confirm_mismatch: "테스트 주문 확인 문구가 일치하지 않습니다",
  live_test_symbol_blocked: "허용되지 않은 종목 코드입니다",
  live_test_daily_cap: "오늘 테스트 주문 횟수 상한에 도달했습니다",
  live_test_max_qty_must_be_1: "테스트 주문 수량은 1주만 허용됩니다",
  live_test_max_orders_per_day_must_be_1: "일일 테스트 주문 상한 설정이 요구사항과 맞지 않습니다",
  live_test_allowed_symbol_missing: "허용 종목 코드가 비어 있습니다",
  symbol_not_allowed_for_live_test: "허용 목록에 없는 종목입니다",
  live_test_order_confirm_not_set_or_invalid: "테스트 주문 확인 문구가 설정되지 않았거나 올바르지 않습니다",
  side_must_be_buy: "테스트 주문은 매수만 허용됩니다",
  qty_must_be_1: "테스트 주문은 1주여야 합니다",
  kiwoom_not_configured: "키움 연동이 구성되지 않았습니다",
  account_fetch_not_ok: "계좌 조회 결과가 유효하지 않아 테스트 주문이 제한됩니다",
  quote_missing_or_invalid_price: "시세가 없거나 가격이 유효하지 않습니다",
  live_test_daily_order_limit_reached: "오늘 테스트 주문 허용 횟수를 모두 사용했습니다",
  live_order_funding_blocked: "미수불가·현금 기준 주문 가능 금액 가드에 걸렸습니다",
};

function mapReasonToLine(code: string): string {
  const k = code.trim();
  return REASON_KO[k] ?? "운영 조건 미충족으로 주문이 제한됩니다";
}

export function formatMarketSessionKorean(phase: string | undefined | null): string {
  const p = String(phase ?? "")
    .trim()
    .toUpperCase();
  if (p === "REGULAR") return "정규장";
  if (
    p === "AFTER_HOURS" ||
    p === "CLOSED" ||
    p === "PRE_OPEN" ||
    p === "PREMARKET"
  ) {
    return "장외";
  }
  if (!p || p === "—") return "미확인";
  return "장외";
}

function livePathErrorSummary(code: string): string {
  const c = code.trim();
  if (c === "live.session_missing" || c.endsWith("session_missing"))
    return "엔진 CLI 로그인 세션이 없습니다";
  if (c === "role_not_trader") return "트레이더 권한이 없어 라이브 경로에 진입하지 못했습니다";
  if (c === "live_confirmation_not_received" || c.includes("confirmation"))
    return "라이브 실행 확인이 완료되지 않았습니다";
  if (c.includes("session_missing")) return "세션 정보가 없어 라이브 경로가 중단되었습니다";
  return "라이브 엔진 경로에서 조기 종료되었습니다";
}

function pickFirstReasonLine(
  ...lists: (string[] | undefined)[]
): string | null {
  for (const list of lists) {
    if (list && list.length > 0 && list[0]) return mapReasonToLine(String(list[0]));
  }
  return null;
}

function quoteStale(quoteAt: string | undefined, staleSec: number): boolean {
  if (!quoteAt) return false;
  const t = Date.parse(quoteAt);
  if (Number.isNaN(t)) return false;
  return (Date.now() - t) / 1000 > staleSec;
}

/** 스냅샷만 반영 (엔진 연동·장·키움). */
export function computeSnapshotBannerModel(
  data: Record<string, unknown> | null,
  options?: { dataIncomplete?: boolean }
): LiveOpsBannerModel {
  const startupError = typeof data?.startupError === "string" ? data.startupError : "";
  const livePathError = typeof data?.livePathError === "string" ? data.livePathError : "";

  const configLoaded = data?.configLoaded as Record<string, unknown> | undefined;
  const kiwoomConfigured = configLoaded?.kiwoomConnectionConfigured === true;
  const liveTradingFlag = configLoaded?.liveTradingEnabled;
  const liveConfigOnOff: LiveOpsBannerModel["liveConfigOnOff"] =
    typeof liveTradingFlag === "boolean"
      ? liveTradingFlag
        ? "ON"
        : "OFF"
      : options?.dataIncomplete
        ? "상태 정보 부족"
        : "OFF";

  const accountRealFetchOk = data?.accountRealFetchOk as boolean | undefined;
  const quoteRealFetchOk = data?.quoteRealFetchOk as boolean | undefined;
  const quoteQueriedAt =
    typeof data?.quoteQueriedAt === "string" ? data.quoteQueriedAt : undefined;

  const market = data?.marketSessionDetected as
    | { effectiveSessionPhase?: string }
    | undefined;
  const sessionMarketRaw = formatMarketSessionKorean(market?.effectiveSessionPhase);
  let sessionMarket = sessionMarketRaw as LiveOpsBannerModel["sessionMarket"];
  if (
    options?.dataIncomplete &&
    (market?.effectiveSessionPhase === undefined || market?.effectiveSessionPhase === "")
  ) {
    sessionMarket = "상태 정보 부족";
  }

  const accountLookup: LiveOpsBannerModel["accountLookup"] =
    accountRealFetchOk === true
      ? "정상"
      : accountRealFetchOk === false
        ? "실패"
        : "미확인";

  let quoteReceive: LiveOpsBannerModel["quoteReceive"] = "미확인";
  if (quoteRealFetchOk === false) quoteReceive = "실패";
  else if (quoteRealFetchOk === true) {
    quoteReceive = quoteStale(quoteQueriedAt, 120) ? "지연" : "정상";
  }

  /** 전략 auto-live dry-run 전용 — 메인 실주문 배너 사유에는 사용하지 않음 (monitor JSON·별도 UI). */
  const testBlockReasons = data?.liveTestOrderBlockReasons as string[] | undefined;

  const liveTestOrderEligible = data?.liveTestOrderEligible as boolean | undefined;

  const sessionOk = sessionMarket === "정규장";

  let actualOrderState: LiveOpsOrderState;
  let blockReasonLine: string;

  if (startupError) {
    actualOrderState = "차단";
    blockReasonLine = "엔진 시작 단계에서 구성 오류가 있습니다";
  } else if (livePathError) {
    actualOrderState = "차단";
    blockReasonLine = livePathErrorSummary(livePathError);
  } else if (!kiwoomConfigured) {
    actualOrderState = "차단";
    blockReasonLine = "키움 API 환경이 설정되지 않았습니다";
  } else if (accountRealFetchOk === false) {
    actualOrderState = "차단";
    blockReasonLine = "실계좌 조회에 실패했습니다";
  } else if (quoteRealFetchOk === false) {
    actualOrderState = "차단";
    blockReasonLine = "실시세 조회에 실패했습니다";
  } else if (!sessionOk) {
    actualOrderState = "차단";
    blockReasonLine =
      sessionMarket === "상태 정보 부족"
        ? "상태 정보 부족 — 엔진이 기록한 장 세션 정보가 없습니다 (monitor-status / live-ops-state 엔진 미러 확인)"
        : sessionMarket === "미확인"
          ? "장 운영 상태를 확인할 수 없어 실주문을 차단합니다"
          : "장외 시간으로 실주문 차단";
  } else if (liveTestOrderEligible === true) {
    actualOrderState = "가능";
    blockReasonLine = "현재 테스트 실주문 허용 조건을 충족했습니다";
  } else {
    actualOrderState = "제한";
    blockReasonLine =
      pickFirstReasonLine(testBlockReasons) ??
      "테스트 실주문 가드 미통과로 주문이 제한됩니다";
  }

  const fund = data?.liveOrderFunding as
    | { fundingGateOk?: boolean; reasonKo?: string }
    | undefined;
  if (
    fund != null &&
    fund.fundingGateOk === false &&
    sessionOk &&
    accountRealFetchOk === true &&
    quoteRealFetchOk === true &&
    kiwoomConfigured &&
    !startupError &&
    !livePathError
  ) {
    actualOrderState = "차단";
    blockReasonLine =
      typeof fund.reasonKo === "string" && fund.reasonKo.trim()
        ? fund.reasonKo.trim()
        : "주문 가능 금액 확인 실패로 실주문 차단";
  }

  const overallState: LiveOpsBannerModel["overallState"] =
    actualOrderState === "가능"
      ? "주문 가능"
      : actualOrderState === "제한"
        ? "제한됨"
        : "차단됨";

  let realOrderYesNo: LiveOpsBannerModel["realOrderYesNo"] =
    actualOrderState === "가능" ? "YES" : "NO";
  if (options?.dataIncomplete && liveConfigOnOff === "상태 정보 부족") {
    realOrderYesNo = "—";
  }

  return {
    overallState,
    realOrderYesNo,
    blockReasonLine,
    sessionMarket,
    accountLookup,
    quoteReceive,
    liveConfigOnOff,
    actualOrderState,
  };
}

function fmtKrw(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function reentryDescribe(cfg: AppConfig, ops: LiveOpsStateFile, symbol: string): string {
  const sym = symbol.trim();
  const cd = Math.max(0, cfg.liveOpsReentryCooldownMinutes);
  if (cd <= 0) return "재진입 쿨다운 비활성";
  const flatAt = ops.symbolLastFlatAt[sym];
  if (!flatAt) return `종목 ${sym}: 최근 청산 기록 없음 (재진입 허용)`;
  const t = Date.parse(flatAt);
  if (Number.isNaN(t)) return `종목 ${sym}: 재진입 허용`;
  const elapsedMin = (Date.now() - t) / 60_000;
  if (elapsedMin >= cd) return `종목 ${sym}: 재진입 허용 (쿨다운 경과)`;
  const left = Math.ceil(cd - elapsedMin);
  return `종목 ${sym}: 재진입 쿨다운 중 (약 ${left}분 남음)`;
}

/**
 * 스냅샷 + 운영 상태 파일 + 운영 가드 병합.
 */
export function buildLiveOpsControlRows(
  data: Record<string, unknown> | null,
  ops: LiveOpsStateFile,
  cfg: AppConfig
): {
  model: LiveOpsBannerModel;
  ext: LiveOpsExtendedBanner;
  envWarnings: string[];
} {
  const { merged, dataIncomplete } = mergeMonitorDataWithEngineMirror(data, ops);
  const base = computeSnapshotBannerModel(merged, { dataIncomplete });
  const envWarnings = liveOpsEnvWarningsForBanner();
  const sym = cfg.liveTestAllowedSymbol.trim() || "005930";
  const opG = evaluateLiveOperationalOrderGate(cfg, { symbol: sym, side: "BUY" });

  let model: LiveOpsBannerModel;

  const finalPossible =
    base.actualOrderState === "가능" && opG.ok && !ops.killSwitchActive;

  if (ops.killSwitchActive) {
    model = {
      ...base,
      actualOrderState: "차단",
      overallState: "차단됨",
      realOrderYesNo: "NO",
      blockReasonLine: "긴급 중단이 활성화되어 신규 실주문이 차단된 상태입니다",
    };
  } else if (!opG.ok) {
    model = {
      ...base,
      actualOrderState: "차단",
      overallState: "차단됨",
      realOrderYesNo: "NO",
      blockReasonLine:
        opG.reasonKoLine ||
        ops.lossHaltReasonKo ||
        "운영 가드에 의해 신규 실주문이 차단되었습니다",
    };
  } else if (finalPossible) {
    model = {
      ...base,
      actualOrderState: "가능",
      overallState: "주문 가능",
      realOrderYesNo: "YES",
      blockReasonLine: "엔진·운영 가드를 모두 통과한 상태입니다",
    };
  } else {
    model = { ...base };
  }

  const maxOd = cfg.liveOpsMaxOrdersPerDay;
  const maxStr = maxOd <= 0 ? "무제한" : String(maxOd);
  const rem =
    maxOd <= 0
      ? "—"
      : String(Math.max(0, maxOd - (ops.ordersTodayCount ?? 0)));

  const lf = data?.liveOrderFunding as
    | {
        cashKrw?: number;
        cashD2Krw?: number;
        noMarginOrderCapKrw?: number;
        capSource?: string;
        requiredKrw?: number;
        fundingGateOk?: boolean;
        reasonKo?: string;
      }
    | undefined;

  const ext: LiveOpsExtendedBanner = {
    killSwitchLine: ops.killSwitchActive
      ? `활성 (${ops.killSwitchActivatedAt ?? "—"} · ${ops.killSwitchActivatedBy ?? ""})`
      : "해제됨",
    ordersToday: String(ops.ordersTodayCount ?? 0),
    ordersMax: maxStr,
    ordersRemaining: rem,
    dailyPnlLine: fmtKrw(ops.dailyRealizedPnlKrw ?? 0),
    lossLimitLine: fmtKrw(cfg.liveMaxDailyLossKrw),
    opsBlockedLine:
      ops.killSwitchActive || !opG.ok
        ? "차단"
        : base.actualOrderState === "차단"
          ? "차단(엔진·장 등)"
          : "아니오",
    reentryLine: reentryDescribe(cfg, ops, sym),
    lastAttempt: ops.lastOrderAttemptAt ?? "—",
    lastSuccess: ops.lastOrderSuccessAt ?? "—",
    lastFailure: ops.lastOrderFailureAt ?? "—",
    fundingCashLine: lf ? fmtKrw(Number(lf.cashKrw) || 0) : "—",
    fundingD2Line: lf ? fmtKrw(Number(lf.cashD2Krw) || 0) : "—",
    fundingNoMarginCapLine: lf ? fmtKrw(Number(lf.noMarginOrderCapKrw) || 0) : "—",
    fundingCapSourceLine: lf && typeof lf.capSource === "string" ? lf.capSource : "—",
    fundingRequiredLine: lf ? fmtKrw(Number(lf.requiredKrw) || 0) : "—",
    fundingGateYesNo:
      lf == null
        ? "—"
        : lf.fundingGateOk === true
          ? "YES"
          : lf.fundingGateOk === false
            ? "NO"
            : "—",
    fundingReasonLine:
      lf && typeof lf.reasonKo === "string" && lf.reasonKo.trim()
        ? lf.reasonKo.trim()
        : "—",
  };

  return { model, ext, envWarnings };
}

/** @deprecated 호환용 — 스냅샷만 */
export function computeLiveOpsBanner(data: Record<string, unknown> | null): LiveOpsBannerModel {
  return computeSnapshotBannerModel(data);
}
