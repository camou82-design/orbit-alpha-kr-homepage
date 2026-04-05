/**
 * 운영자용 LIVE 모니터 상단 배너 문구 (스냅샷 JSON 기준, reasons 원문 노출 없음).
 */

export type LiveOpsOrderState = "가능" | "제한" | "차단";

export interface LiveOpsBannerModel {
  overallState: "주문 가능" | "제한됨" | "차단됨";
  realOrderYesNo: "YES" | "NO";
  blockReasonLine: string;
  sessionMarket: "정규장" | "장외" | "미확인";
  accountLookup: "정상" | "실패" | "미확인";
  quoteReceive: "정상" | "지연" | "실패" | "미확인";
  liveConfigOnOff: "ON" | "OFF";
  actualOrderState: LiveOpsOrderState;
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
  live_test_daily_cap: "일일 테스트 주문 횟수 상한에 도달했습니다",
  live_test_max_qty_must_be_1: "테스트 주문 수량은 1주만 허용됩니다",
  live_test_max_orders_per_day_must_be_1: "일일 테스트 주문 상한 설정이 요구사항과 맞지 않습니다",
  live_test_allowed_symbol_missing: "허용 종목 코드가 비어 있습니다",
  symbol_not_allowed_for_live_test: "허용 목록에 없는 종목입니다",
  live_test_order_confirm_not_set_or_invalid: "테스트 주문 확인 문구가 설정되지 않았거나 올바르지 않습니다",
  side_must_be_buy: "테스트 주문은 매수만 허용됩니다",
  qty_must_be_1: "테스트 주문 수량은 1주여야 합니다",
  kiwoom_not_configured: "키움 연동이 구성되지 않았습니다",
  account_fetch_not_ok: "계좌 조회 결과가 유효하지 않아 테스트 주문이 제한됩니다",
  quote_missing_or_invalid_price: "시세가 없거나 가격이 유효하지 않습니다",
  live_test_daily_order_limit_reached: "오늘 테스트 주문 허용 횟수를 모두 사용했습니다",
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

/**
 * 스냅샷 레코드로 운영 배너 모델 계산 (JSON/배열 그대로 노출하지 않음).
 */
export function computeLiveOpsBanner(data: Record<string, unknown> | null): LiveOpsBannerModel {
  const startupError = typeof data?.startupError === "string" ? data.startupError : "";
  const livePathError = typeof data?.livePathError === "string" ? data.livePathError : "";

  const configLoaded = data?.configLoaded as Record<string, unknown> | undefined;
  const kiwoomConfigured = configLoaded?.kiwoomConnectionConfigured === true;
  const liveTradingFlag = configLoaded?.liveTradingEnabled;
  const liveConfigOnOff: "ON" | "OFF" =
    liveTradingFlag === true ? "ON" : "OFF";

  const accountRealFetchOk = data?.accountRealFetchOk as boolean | undefined;
  const quoteRealFetchOk = data?.quoteRealFetchOk as boolean | undefined;
  const quoteQueriedAt =
    typeof data?.quoteQueriedAt === "string" ? data.quoteQueriedAt : undefined;

  const market = data?.marketSessionDetected as
    | { effectiveSessionPhase?: string }
    | undefined;
  const sessionMarketRaw = formatMarketSessionKorean(market?.effectiveSessionPhase);
  const sessionMarket = sessionMarketRaw as LiveOpsBannerModel["sessionMarket"];

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

  const blockReasons = (data?.dryRunBlockReasons ??
    (data?.liveDryRunDecision as { reasons?: string[] } | undefined)?.reasons) as
    | string[]
    | undefined;
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
      sessionMarket === "미확인"
        ? "장 운영 상태를 확인할 수 없어 실주문을 차단합니다"
        : "장외 시간으로 실주문 차단";
  } else if (liveTestOrderEligible === true) {
    actualOrderState = "가능";
    blockReasonLine = "현재 테스트 실주문 허용 조건을 충족했습니다";
  } else {
    actualOrderState = "제한";
    blockReasonLine =
      pickFirstReasonLine(testBlockReasons, blockReasons) ??
      "테스트 실주문 가드 미통과로 주문이 제한됩니다";
  }

  const overallState: LiveOpsBannerModel["overallState"] =
    actualOrderState === "가능"
      ? "주문 가능"
      : actualOrderState === "제한"
        ? "제한됨"
        : "차단됨";

  const realOrderYesNo: "YES" | "NO" = actualOrderState === "가능" ? "YES" : "NO";

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
