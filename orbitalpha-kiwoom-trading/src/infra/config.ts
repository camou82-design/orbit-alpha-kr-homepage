import "dotenv/config";
import type { MarketSessionPhase } from "../kiwoom/market-hours.js";
import { parseForceSessionPhase } from "../kiwoom/market-hours.js";

export interface AppConfig {
  appName: string;
  appEnv: string;
  tz: string;
  logLevel: string;
  paperTrading: boolean;
  loopIntervalMs: number;
  /** Empty = run until SIGINT. */
  paperLoopMaxTicks: number | null;
  signalsDir: string;
  logsDir: string;
  tradesDir: string;
  signalCandidateMinScore: number;
  universeMinTurnoverKrw: number;
  universeExcludeEtfEtn: boolean;
  universeExcludeNonNormal: boolean;
  /** Set e.g. REGULAR to test session logic outside market hours (mock paper only). */
  forceSessionPhase: MarketSessionPhase | null;
  /** Suffix for signals/reports/log filenames when comparing parameter runs (alnum, _, -). */
  experimentTag: string | null;
  /** Mock pump paper trading (in-memory; no live orders). */
  paperMaxOpenPositions: number;
  paperEntryMinScore: number;
  paperMaxEntriesPerTick: number;
  paperStopLossPct: number;
  paperTakeProfitPct: number;
  paperMaxHoldTicks: number;
  paperTrailingStopPct: number;
  paperPositionSizeKrw: number;
  /** Buy/sell slippage vs last price (percent points, e.g. 0.02 = 2 bps style). */
  paperFillSlippagePct: number;
  /**
   * Paper 진입 시 상한가까지 잔여 여력(%) 최소값.
   * ((upper - last) / last) * 100 가 이보다 작으면 pump 진입 제외.
   */
  paperMinHeadroomToUpperLimitPct: number;
  /** Pump 진입: 전일 종가 대비 당일 상승률(%) 상한 초과 시 제외. */
  paperMaxChangeFromPrevClosePct: number;
  /** Pump 진입: 당일 고저 범위 대비 윗꼬리 비율(%) 상한 초과 시 제외. */
  paperMaxUpperWickRatioPct: number;
  /** US-linked mock risk filter (no live feed). */
  usFilterEnabled: boolean;
  usNasdaqFuturesNegativePct: number;
  usUsdkrwPositivePct: number;
  usKospi200FuturesNegativePct: number;
  /** true = exclude new entries when risk-off; false = score penalty only. */
  usRiskBlockMode: boolean;
  usRiskScorePenalty: number;
  /** Mock only: normal | weak | strong — see getMockGlobalRiskSnapshot. */
  usMockRiskScenario: "normal" | "weak" | "strong";
  /** Monday weekend-news / open-window guardrails (mock headline flags). */
  mondayFilterEnabled: boolean;
  mondayOpenBlockMinutes: number;
  mondayExtraScorePenalty: number;
  mondayWeekendRiskBlockThreshold: number;
  mondayWeekendRiskPenaltyThreshold: number;
  mondayGapStricterPct: number;
  mondayMockWeekendScenario: "normal" | "caution" | "severe";
  /** Dev: 0–6 weekday for Monday filters (1=Mon). Empty = real clock. */
  mondayDevSimulateWeekday: number | null;
  mondayDevSimulateMinutesAfterOpen: number | null;
  /** Local auth; false = dev bypass (no password prompt). */
  authEnabled: boolean;
  adminUsername: string;
  adminPassword: string;
  viewerUsername: string;
  viewerPassword: string;
  traderUsername: string;
  traderPassword: string;
  /** Role used when AUTH_ENABLED=false. */
  authBypassRole: "viewer" | "trader";
  liveTradingEnabled: boolean;
  liveConfirmationRequired: boolean;
  liveMaxDailyLossKrw: number;
  liveMaxOrderSizeKrw: number;
  liveMaxOpenPositions: number;
  /**
   * paper | reports | live | menu — menu prompts after dashboard.
   * Unset + auth off defaults to paper (backward compatible).
   */
  appEntryMode: "paper" | "reports" | "live" | "menu" | null;
  /** Commission / tax as percent points (0.015 = 0.015%). */
  kiwoomFeeBuyPct: number;
  kiwoomFeeSellPct: number;
  /** Sell-side transaction tax (retail simplified). */
  kiwoomTaxSellPct: number;
  /** Include sell tax in PnL and cost-edge filter. */
  paperIncludeTax: boolean;
  /** Extra margin above min cost stack for pump edge filter (percent points). */
  paperCostEdgeBufferPct: number;
  kiwoomMode: string;
  kiwoomAccountNo: string;
  kiwoomApiKey: string;
  kiwoomApiSecret: string;
  /** Kiwoom REST API host (OAuth + TR). Mock: https://mockapi.kiwoom.com */
  kiwoomRestBaseUrl: string;
  kiwoomRestOAuthPath: string;
  kiwoomRestAcntPath: string;
  /** ka10001 등 종목 기본정보용 (`/api/dostk/stkinfo`). 실시간 매매 시세에는 사용하지 않음. */
  kiwoomRestStkPath: string;
  /** 실시간 시세 TR (기본 ka10007 시세표성정보, `/api/dostk/mrkcond`). */
  kiwoomRestQuotePath: string;
  kiwoomRestOrdrPath: string;
  /** TR api-id headers for REST calls. */
  kiwoomTrBalanceId: string;
  /** 기본 ka10007 (시세표성정보요청, 응답에 cur_prc 명시). stkinfo/ka10001과 분리. */
  kiwoomTrQuoteId: string;
  kiwoomTrBuyId: string;
  /** Scoped live test buy only — requires LIVE_TRADING_ENABLED and strict guards. */
  liveTestOrderEnabled: boolean;
  liveTestMaxQty: number;
  liveTestMaxOrdersPerDay: number;
  liveTestAllowedSymbol: string;
  /** Must equal EXECUTE_TEST_BUY_ONCE (see .env.example) to allow one test buy. */
  liveTestOrderConfirm: string;
  /** 운영 실주문 일일 횟수 상한(브로커 POST 기준). 0 = 무제한. */
  liveOpsMaxOrdersPerDay: number;
  /** 청산 후 동일 종목 매수 재진입 금지 시간(분). 0 = 비활성. */
  liveOpsReentryCooldownMinutes: number;
}

function bool(v: string | undefined, defaultValue: boolean): boolean {
  if (v === undefined) return defaultValue;
  return v === "1" || v.toLowerCase() === "true";
}

function num(v: string | undefined, defaultValue: number): number {
  if (v === undefined || v === "") return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

function parseUsMockRiskScenario(
  raw: string | undefined
): "normal" | "weak" | "strong" {
  const t = raw?.trim().toLowerCase();
  if (t === "weak" || t === "strong") return t;
  return "normal";
}

function parseMondayMockWeekendScenario(
  raw: string | undefined
): "normal" | "caution" | "severe" {
  const t = raw?.trim().toLowerCase();
  if (t === "caution" || t === "severe") return t;
  return "normal";
}

function optionalWeekdayOverride(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const w = Math.floor(n);
  if (w < 0 || w > 6) return null;
  return w;
}

function optionalNonNegativeNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseAuthBypassRole(raw: string | undefined): "viewer" | "trader" {
  const t = raw?.trim().toLowerCase();
  if (t === "trader") return "trader";
  return "viewer";
}

function parseAppEntryMode(
  raw: string | undefined
): "paper" | "reports" | "live" | "menu" | null {
  if (raw === undefined || raw === "") return null;
  const t = raw.trim().toLowerCase();
  if (t === "paper" || t === "reports" || t === "live" || t === "menu") return t;
  return null;
}

function optionalPositiveInt(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/** Safe filename segment for experiment-tagged outputs. */
export function sanitizeExperimentTag(raw: string | undefined): string | null {
  if (raw === undefined || raw === "") return null;
  const t = raw.trim();
  if (!t) return null;
  const safe = t
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!safe || safe.length > 48) {
    console.warn(
      `[config] invalid EXPERIMENT_TAG "${raw}" (use 1-48 chars: letters, digits, _, -); ignoring`
    );
    return null;
  }
  return safe;
}

export function loadConfig(): AppConfig {
  const rawForce = process.env.FORCE_SESSION_PHASE?.trim();
  const forceSessionPhase = parseForceSessionPhase(rawForce);
  if (rawForce && forceSessionPhase === null) {
    console.warn(
      `[config] invalid FORCE_SESSION_PHASE="${rawForce}" (use CLOSED, PRE_OPEN, PREMARKET, REGULAR, AFTER_HOURS); ignoring`
    );
  }

  const rawTag = process.env.EXPERIMENT_TAG?.trim();
  const experimentTag = sanitizeExperimentTag(rawTag ?? undefined);

  const liveTradingEnabled = bool(process.env.LIVE_TRADING_ENABLED, false);
  if (liveTradingEnabled) {
    console.warn(
      "[config] LIVE_TRADING_ENABLED=true — only the guarded one-shot LIVE test buy path may send orders; strategy auto-live remains off."
    );
  }

  return {
    appName: process.env.APP_NAME ?? "orbitalpha-kiwoom-trading",
    appEnv: process.env.APP_ENV ?? "development",
    tz: process.env.TZ ?? "Asia/Seoul",
    logLevel: process.env.LOG_LEVEL ?? "info",
    paperTrading: bool(process.env.PAPER_TRADING, true),
    loopIntervalMs: num(process.env.LOOP_INTERVAL_MS, 5000),
    paperLoopMaxTicks: optionalPositiveInt(process.env.PAPER_LOOP_MAX_TICKS),
    signalsDir: process.env.SIGNALS_DIR ?? "data/signals",
    logsDir: process.env.LOGS_DIR ?? "logs",
    tradesDir: process.env.TRADES_DIR ?? "data/trades",
    signalCandidateMinScore: num(process.env.SIGNAL_CANDIDATE_MIN_SCORE, 38),
    universeMinTurnoverKrw: num(process.env.UNIVERSE_MIN_TURNOVER_KRW, 500_000_000),
    universeExcludeEtfEtn: bool(process.env.UNIVERSE_EXCLUDE_ETF_ETN, true),
    universeExcludeNonNormal: bool(process.env.UNIVERSE_EXCLUDE_NON_NORMAL, true),
    forceSessionPhase,
    experimentTag,
    paperMaxOpenPositions: Math.max(1, Math.floor(num(process.env.PAPER_MAX_OPEN_POSITIONS, 1))),
    paperEntryMinScore: num(process.env.PAPER_ENTRY_MIN_SCORE, 40),
    paperMaxEntriesPerTick: Math.max(1, Math.floor(num(process.env.PAPER_MAX_ENTRIES_PER_TICK, 2))),
    paperStopLossPct: num(process.env.PAPER_STOP_LOSS_PCT, 1.5),
    paperTakeProfitPct: num(process.env.PAPER_TAKE_PROFIT_PCT, 3.0),
    paperMaxHoldTicks: Math.max(1, Math.floor(num(process.env.PAPER_MAX_HOLD_TICKS, 12))),
    paperTrailingStopPct: num(process.env.PAPER_TRAILING_STOP_PCT, 1.2),
    paperPositionSizeKrw: num(process.env.PAPER_POSITION_SIZE_KRW, 300_000),
    paperFillSlippagePct: num(process.env.PAPER_FILL_SLIPPAGE_PCT, 0.02),
    paperMinHeadroomToUpperLimitPct: num(
      process.env.PAPER_MIN_HEADROOM_TO_UPPER_LIMIT_PCT,
      5.0
    ),
    paperMaxChangeFromPrevClosePct: num(
      process.env.PAPER_MAX_CHANGE_FROM_PREV_CLOSE_PCT,
      20
    ),
    paperMaxUpperWickRatioPct: num(process.env.PAPER_MAX_UPPER_WICK_RATIO_PCT, 45),
    usFilterEnabled: bool(process.env.US_FILTER_ENABLED, true),
    usNasdaqFuturesNegativePct: num(
      process.env.US_NASDAQ_FUTURES_NEGATIVE_PCT,
      -0.5
    ),
    usUsdkrwPositivePct: num(process.env.US_USDKRW_POSITIVE_PCT, 0.5),
    usKospi200FuturesNegativePct: num(
      process.env.US_KOSPI200_FUTURES_NEGATIVE_PCT,
      -0.5
    ),
    usRiskBlockMode: bool(process.env.US_RISK_BLOCK_MODE, true),
    usRiskScorePenalty: Math.max(0, num(process.env.US_RISK_SCORE_PENALTY, 10)),
    usMockRiskScenario: parseUsMockRiskScenario(process.env.US_MOCK_RISK_SCENARIO),
    mondayFilterEnabled: bool(process.env.MONDAY_FILTER_ENABLED, true),
    mondayOpenBlockMinutes: Math.max(
      0,
      Math.floor(num(process.env.MONDAY_OPEN_BLOCK_MINUTES, 10))
    ),
    mondayExtraScorePenalty: Math.max(
      0,
      num(process.env.MONDAY_EXTRA_SCORE_PENALTY, 8)
    ),
    mondayWeekendRiskBlockThreshold: Math.max(
      1,
      Math.floor(num(process.env.MONDAY_WEEKEND_RISK_BLOCK_THRESHOLD, 3))
    ),
    mondayWeekendRiskPenaltyThreshold: Math.max(
      1,
      Math.floor(num(process.env.MONDAY_WEEKEND_RISK_PENALTY_THRESHOLD, 2))
    ),
    mondayGapStricterPct: num(process.env.MONDAY_GAP_STRICTER_PCT, 15),
    mondayMockWeekendScenario: parseMondayMockWeekendScenario(
      process.env.MONDAY_MOCK_WEEKEND_SCENARIO
    ),
    mondayDevSimulateWeekday: optionalWeekdayOverride(
      process.env.MONDAY_DEV_SIMULATE_WEEKDAY
    ),
    mondayDevSimulateMinutesAfterOpen: optionalNonNegativeNumber(
      process.env.MONDAY_DEV_SIMULATE_MINUTES_AFTER_OPEN
    ),
    authEnabled: bool(process.env.AUTH_ENABLED, false),
    adminUsername: process.env.ADMIN_USERNAME ?? "admin",
    adminPassword: process.env.ADMIN_PASSWORD ?? "",
    viewerUsername: process.env.VIEWER_USERNAME ?? "viewer",
    viewerPassword: process.env.VIEWER_PASSWORD ?? "",
    traderUsername: process.env.TRADER_USERNAME ?? "trader",
    traderPassword: process.env.TRADER_PASSWORD ?? "",
    authBypassRole: parseAuthBypassRole(process.env.AUTH_BYPASS_ROLE),
    liveTradingEnabled,
    liveConfirmationRequired: bool(process.env.LIVE_CONFIRMATION_REQUIRED, true),
    liveMaxDailyLossKrw: num(process.env.LIVE_MAX_DAILY_LOSS_KRW, 100_000),
    liveMaxOrderSizeKrw: num(process.env.LIVE_MAX_ORDER_SIZE_KRW, 300_000),
    liveMaxOpenPositions: Math.max(
      1,
      Math.floor(num(process.env.LIVE_MAX_OPEN_POSITIONS, 1))
    ),
    appEntryMode: parseAppEntryMode(process.env.APP_ENTRY_MODE),
    kiwoomFeeBuyPct: num(process.env.KIWOOM_FEE_BUY_PCT, 0.015),
    kiwoomFeeSellPct: num(process.env.KIWOOM_FEE_SELL_PCT, 0.015),
    kiwoomTaxSellPct: num(process.env.KIWOOM_TAX_SELL_PCT, 0.2),
    paperIncludeTax: bool(process.env.PAPER_INCLUDE_TAX, true),
    paperCostEdgeBufferPct: num(process.env.PAPER_COST_EDGE_BUFFER_PCT, 0.4),
    kiwoomMode: process.env.KIWOOM_MODE ?? "paper",
    kiwoomAccountNo: process.env.KIWOOM_ACCOUNT_NO ?? "",
    kiwoomApiKey: process.env.KIWOOM_API_KEY ?? "",
    kiwoomApiSecret: process.env.KIWOOM_API_SECRET ?? "",
    /**
     * 키움 REST 포털 기준(운영): `https://api.kiwoom.com` · 모의: `https://mockapi.kiwoom.com`
     * OAuth 토큰: 보통 `POST .../oauth2/token` (명세·포털 가이드와 동일하게 맞출 것)
     */
    kiwoomRestBaseUrl: process.env.KIWOOM_REST_BASE_URL ?? "https://api.kiwoom.com",
    kiwoomRestOAuthPath: process.env.KIWOOM_REST_OAUTH_PATH ?? "/oauth2/token",
    kiwoomRestAcntPath: process.env.KIWOOM_REST_ACNT_PATH ?? "/api/dostk/acnt",
    /** 종목 기본정보(ka10001) — 매매 시세용이 아님. */
    kiwoomRestStkPath: process.env.KIWOOM_REST_STK_PATH ?? "/api/dostk/stkinfo",
    kiwoomRestQuotePath: process.env.KIWOOM_REST_QUOTE_PATH ?? "/api/dostk/mrkcond",
    kiwoomRestOrdrPath: process.env.KIWOOM_REST_ORDR_PATH ?? "/api/dostk/ordr",
    kiwoomTrBalanceId: process.env.KIWOOM_TR_BALANCE ?? "kt00005",
    kiwoomTrQuoteId: process.env.KIWOOM_TR_QUOTE ?? "ka10007",
    kiwoomTrBuyId: process.env.KIWOOM_TR_BUY ?? "kt10000",
    liveTestOrderEnabled: bool(process.env.LIVE_TEST_ORDER_ENABLED, false),
    liveTestMaxQty: Math.floor(num(process.env.LIVE_TEST_MAX_QTY, 0)),
    liveTestMaxOrdersPerDay: Math.floor(num(process.env.LIVE_TEST_MAX_ORDERS_PER_DAY, 0)),
    liveTestAllowedSymbol: (process.env.LIVE_TEST_ALLOWED_SYMBOL ?? "").trim(),
    liveTestOrderConfirm: (process.env.LIVE_TEST_ORDER_CONFIRM ?? "").trim(),
    liveOpsMaxOrdersPerDay: Math.max(0, Math.floor(num(process.env.LIVE_OPS_MAX_ORDERS_PER_DAY, 50))),
    liveOpsReentryCooldownMinutes: Math.max(
      0,
      Math.floor(num(process.env.LIVE_OPS_REENTRY_COOLDOWN_MINUTES, 45))
    ),
  };
}
