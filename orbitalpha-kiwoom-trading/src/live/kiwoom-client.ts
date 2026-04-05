import type { AppConfig } from "../infra/config.js";
import { isKiwoomConnectionConfigured } from "../infra/config-validation.js";
import type { Logger } from "../infra/logger.js";
import {
  fetchKiwoomAccessToken,
  firstOutputArray,
  kiwoomTrPost,
  parseKiwoomAccountParts,
  pickNumeric,
} from "../kiwoom/kiwoom-rest.js";
import type {
  MonitorAccountSummary,
  MonitorHoldingRow,
} from "../infra/monitor-snapshot.js";

export type KiwoomConnectStatus = "not_configured" | "connected" | "error";

export interface KiwoomConnectResult {
  status: KiwoomConnectStatus;
  message: string;
}

export interface KiwoomAccountInfoResult {
  ok: boolean;
  accountNoMasked?: string;
  message: string;
  holdings?: MonitorHoldingRow[];
  accountSummary?: MonitorAccountSummary;
}

export interface KiwoomQuoteResult {
  ok: boolean;
  symbol: string;
  lastPrice?: number | null;
  prevClose?: number | null;
  turnover?: number | null;
  message: string;
}

function maskAccount(no: string): string {
  const t = no.trim();
  return t.length > 4 ? `****${t.slice(-4)}` : "****";
}

function numFromRow(row: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    if (k in row) {
      const n = pickNumeric(row[k], []);
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

function mapHoldingRow(row: Record<string, unknown>): MonitorHoldingRow | null {
  const symbol = String(row.stk_cd ?? row.STK_CD ?? "").trim();
  if (!symbol) return null;
  const name = String(row.stk_nm ?? row.prdt_name ?? row.issu_nm ?? symbol);
  const qty = Math.floor(
    numFromRow(row, ["rmnd_qty", "hldg_qty", "ord_psbl_qty"]) || 0
  );
  const avgBuyPrice = Math.round(
    numFromRow(row, ["pchs_avg_pric", "avg_prc", "avg_pur_prc"]) || 0
  );
  const currentPrice = Math.round(
    numFromRow(row, ["prpr", "stck_prpr", "now_pric", "cur_prc"]) || 0
  );
  const evalAmountKrw = Math.round(
    numFromRow(row, ["evlu_amt", "evlu_amt2"]) || 0
  );
  const costAmountKrw = Math.round(numFromRow(row, ["pchs_amt", "pur_amt"]) || 0);
  const evalPnlKrw = Math.round(
    numFromRow(row, ["evlu_pfls_amt", "pl_amt"]) || 0
  );
  const returnPct = numFromRow(row, ["evlu_pfls_rt", "prft_rt"]) || 0;
  const netPnlKrw = Math.round(
    numFromRow(row, ["evlu_pfls_amt", "ffuu_amt"]) || evalPnlKrw
  );

  return {
    name,
    symbol,
    quantity: qty,
    avgBuyPrice,
    currentPrice,
    evalAmountKrw,
    costAmountKrw,
    evalPnlKrw,
    returnPct,
    netPnlKrw,
  };
}

function zeroCashSummary(): Pick<
  MonitorAccountSummary,
  | "cashKrw"
  | "cashD1Krw"
  | "cashD2Krw"
  | "paymentAvailableKrw"
  | "orderAvailableKrw"
  | "totReBuyOrderAllowableKrw"
> {
  return {
    cashKrw: 0,
    cashD1Krw: 0,
    cashD2Krw: 0,
    paymentAvailableKrw: 0,
    orderAvailableKrw: 0,
    totReBuyOrderAllowableKrw: 0,
  };
}

function roundKrw(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

/**
 * kt00005 상단 키만 사용 (account.real.debug topLevelKeys에 존재).
 * entr/entr_d1/entr_d2/pymn_alow_amt/ord_alowa/tot_re_buy_alowa
 */
function enrichSummaryWithKt00005Cash(
  rec: Record<string, unknown>,
  s: MonitorAccountSummary
): MonitorAccountSummary {
  return {
    ...s,
    cashKrw: roundKrw(pickNumeric(rec.entr, [])),
    cashD1Krw: roundKrw(pickNumeric(rec.entr_d1, [])),
    cashD2Krw: roundKrw(pickNumeric(rec.entr_d2, [])),
    paymentAvailableKrw: roundKrw(pickNumeric(rec.pymn_alow_amt, [])),
    orderAvailableKrw: roundKrw(pickNumeric(rec.ord_alowa, [])),
    totReBuyOrderAllowableKrw: roundKrw(pickNumeric(rec.tot_re_buy_alowa, [])),
  };
}

function summarizeHoldings(rows: MonitorHoldingRow[]): MonitorAccountSummary {
  let totalEvalKrw = 0;
  let totalCostKrw = 0;
  let totalEvalPnlKrw = 0;
  let totalNetPnlKrw = 0;
  for (const h of rows) {
    totalEvalKrw += h.evalAmountKrw;
    totalCostKrw += h.costAmountKrw;
    totalEvalPnlKrw += h.evalPnlKrw;
    totalNetPnlKrw += h.netPnlKrw;
  }
  const denom = totalCostKrw > 0 ? totalCostKrw : 1;
  const totalReturnPct = ((totalEvalKrw - totalCostKrw) / denom) * 100;
  return {
    ...zeroCashSummary(),
    totalEvalKrw,
    totalCostKrw,
    totalEvalPnlKrw,
    totalReturnPct,
    totalNetPnlKrw,
    note: "실계좌 체결잔고 TR 연동 요약 (필드 매핑은 증권사 응답 스키마에 따라 달라질 수 있음).",
  };
}

/**
 * kt00005: 실제 응답에 `output1` 배열이 없고 상단 숫자 필드만 오는 경우
 * (account.real.debug topLevelKeys에 evlt_amt_tot, stk_buy_tot_amt, tot_pl_tot, tot_pl_rt 등).
 */
function summarizeKt00005TopLevel(rec: Record<string, unknown>): MonitorAccountSummary | null {
  const ev = pickNumeric(rec.evlt_amt_tot, []);
  const cost = pickNumeric(rec.stk_buy_tot_amt, []);
  const pl = pickNumeric(rec.tot_pl_tot, []);
  const plRt = pickNumeric(rec.tot_pl_rt, []);
  if (!Number.isFinite(ev) && !Number.isFinite(cost) && !Number.isFinite(pl)) {
    return null;
  }
  return {
    ...zeroCashSummary(),
    totalEvalKrw: Math.round(Number.isFinite(ev) ? ev : 0),
    totalCostKrw: Math.round(Number.isFinite(cost) ? cost : 0),
    totalEvalPnlKrw: Math.round(Number.isFinite(pl) ? pl : 0),
    totalReturnPct: Number.isFinite(plRt) ? plRt : 0,
    totalNetPnlKrw: Math.round(Number.isFinite(pl) ? pl : 0),
    note: "kt00005 응답 상단 요약 필드(evlt_amt_tot·stk_buy_tot_amt·tot_pl_tot·tot_pl_rt) 기준",
  };
}

function describeJsonShape(json: unknown): {
  topLevelKeys: string[];
  outputArrayLength: number;
  firstRowKeys: string[];
} {
  if (json === null || json === undefined || typeof json !== "object") {
    return { topLevelKeys: [], outputArrayLength: 0, firstRowKeys: [] };
  }
  const rec = json as Record<string, unknown>;
  const topLevelKeys = Object.keys(rec);
  const arr = firstOutputArray(json);
  const first = arr[0] ?? {};
  const firstRowKeys =
    first && typeof first === "object" ? Object.keys(first as Record<string, unknown>) : [];
  return {
    topLevelKeys,
    outputArrayLength: arr.length,
    firstRowKeys,
  };
}

/**
 * OAuth token — verifies app key / secret for REST.
 */
export async function connectKiwoom(
  logger: Logger,
  config: AppConfig
): Promise<KiwoomConnectResult> {
  logger.info("kiwoom.connect", { msg: "attempt", kiwoomMode: config.kiwoomMode });

  if (!isKiwoomConnectionConfigured(config)) {
    const message =
      "Kiwoom env not set (KIWOOM_ACCOUNT_NO / KIWOOM_API_KEY / KIWOOM_API_SECRET)";
    logger.info("kiwoom.connect", { msg: "not_configured", reason: message });
    return { status: "not_configured", message };
  }

  const t = await fetchKiwoomAccessToken(config);
  if (!t.ok) {
    logger.warn("kiwoom.connect", { msg: "error", error: t.message });
    return { status: "error", message: t.message };
  }
  logger.info("kiwoom.connect", { msg: "success", detail: "oauth token acquired" });
  return { status: "connected", message: "oauth token acquired (REST)" };
}

export async function fetchAccountInfo(
  logger: Logger,
  config: AppConfig
): Promise<KiwoomAccountInfoResult> {
  logger.info("kiwoom.account", { msg: "fetch attempt" });

  if (!isKiwoomConnectionConfigured(config)) {
    const message = "skipped — Kiwoom connection not configured";
    logger.info("kiwoom.account", { msg: "not_configured", reason: message });
    logger.info("account.real", { msg: "account real fetch fail", reason: "not_configured" });
    return { ok: false, message };
  }

  const parts = parseKiwoomAccountParts(config.kiwoomAccountNo);
  if (!parts) {
    const message = "invalid KIWOOM_ACCOUNT_NO (need 8+ digits / standard 형식)";
    logger.warn("kiwoom.account", { msg: "error", reason: message });
    logger.info("account.real", { msg: "account real fetch fail", reason: "bad_account_format" });
    return { ok: false, message };
  }

  const token = await fetchKiwoomAccessToken(config);
  if (!token.ok) {
    logger.warn("kiwoom.account", { msg: "oauth failed", error: token.message });
    logger.info("account.real", { msg: "account real fetch fail", reason: "oauth_failed" });
    return { ok: false, message: token.message };
  }

  /** kt00005: API 오류 return_msg 기준 필수 `dmst_stex_tp` (국내거래소 구분). */
  const body: Record<string, unknown> = {
    dmst_stex_tp: "KRX",
    cano: parts.cano,
    acnt_prdt_cd: parts.acnt_prdt_cd,
  };

  const tr = await kiwoomTrPost(
    config,
    token.accessToken,
    config.kiwoomRestAcntPath,
    config.kiwoomTrBalanceId,
    body
  );

  if (!tr.ok) {
    const shape = describeJsonShape(tr.json);
    logger.info("account.real.debug", {
      msg: "account real fetch http/tr error",
      endpoint: config.kiwoomRestAcntPath,
      apiId: config.kiwoomTrBalanceId,
      httpStatus: tr.httpStatus,
      topLevelKeys: shape.topLevelKeys,
      outputArrayLength: shape.outputArrayLength,
      firstRowKeys: shape.firstRowKeys,
    });
    logger.warn("kiwoom.account", { msg: "tr error", detail: tr.message });
    logger.info("account.real", {
      msg: "account real fetch fail",
      reason: "tr_error",
      detail: tr.message,
    });
    return { ok: false, message: tr.message };
  }

  const rows = firstOutputArray(tr.json)
    .map(mapHoldingRow)
    .filter((x): x is MonitorHoldingRow => x !== null);

  const topRec =
    tr.json !== null && typeof tr.json === "object"
      ? (tr.json as Record<string, unknown>)
      : null;
  const fromTop = topRec ? summarizeKt00005TopLevel(topRec) : null;

  let summary: MonitorAccountSummary =
    rows.length > 0
      ? summarizeHoldings(rows)
      : fromTop ?? {
        ...zeroCashSummary(),
        totalEvalKrw: 0,
        totalCostKrw: 0,
        totalEvalPnlKrw: 0,
        totalReturnPct: 0,
        totalNetPnlKrw: 0,
        note: "체결잔고 없음 (TR 응답 정상)",
      };

  if (topRec) {
    summary = enrichSummaryWithKt00005Cash(topRec, summary);
  }

  const masked = maskAccount(config.kiwoomAccountNo);
  const shape = describeJsonShape(tr.json);
  logger.info("account.real.debug", {
    msg: "account real fetch parse",
    endpoint: config.kiwoomRestAcntPath,
    apiId: config.kiwoomTrBalanceId,
    httpStatus: tr.httpStatus,
    topLevelKeys: shape.topLevelKeys,
    outputArrayLength: shape.outputArrayLength,
    firstRowKeys: shape.firstRowKeys,
  });
  logger.info("account.real.parse", {
    msg: "account real parse summary",
    holdingRows: rows.length,
    summarySource: rows.length > 0 ? "output1_rows" : fromTop ? "kt00005_top_level" : "empty_fallback",
    totalEvalKrw: summary.totalEvalKrw,
    totalCostKrw: summary.totalCostKrw,
    totalEvalPnlKrw: summary.totalEvalPnlKrw,
    totalNetPnlKrw: summary.totalNetPnlKrw,
    cashKrw: summary.cashKrw,
    orderAvailableKrw: summary.orderAvailableKrw,
    rawCashEntr: topRec?.entr,
    parsedCashEntr: summary.cashKrw,
  });
  logger.info("kiwoom.account", {
    msg: "fetch ok",
    accountNoMasked: masked,
    holdingRows: rows.length,
  });
  logger.info("account.real", { msg: "account real fetch success", holdingRows: rows.length });

  return {
    ok: true,
    accountNoMasked: masked,
    message: "ok",
    holdings: rows,
    accountSummary: summary,
  };
}

function extractLastPrice(json: unknown): number | null {
  if (json === null || json === undefined) return null;
  const rec = json as Record<string, unknown>;
  const keys = ["prpr", "stck_prpr", "now_pric", "cur_prc", "last", "ovrs_prpr"];

  for (const k of keys) {
    if (k in rec) {
      const n = pickNumeric(rec[k], []);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }

  const out = rec.output;
  if (out && typeof out === "object" && !Array.isArray(out)) {
    const o = out as Record<string, unknown>;
    const p = numFromRow(o, keys);
    if (Number.isFinite(p) && p > 0) return p;
  }

  const arr = firstOutputArray(json);
  if (arr.length > 0) {
    const p = numFromRow(arr[0], keys);
    if (Number.isFinite(p) && p > 0) return p;
  }

  return null;
}

function extractPrevClosePrice(json: unknown): number | null {
  if (json === null || json === undefined) return null;
  const rec = json as Record<string, unknown>;
  const keys = ["stck_sdpr", "prev_close", "sdpr", "pre_close"];

  for (const k of keys) {
    if (k in rec) {
      const n = pickNumeric(rec[k], []);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }

  const out = rec.output;
  if (out && typeof out === "object" && !Array.isArray(out)) {
    const o = out as Record<string, unknown>;
    const p = numFromRow(o, keys);
    if (Number.isFinite(p) && p > 0) return p;
  }

  const arr = firstOutputArray(json);
  if (arr.length > 0) {
    const p = numFromRow(arr[0], keys);
    if (Number.isFinite(p) && p > 0) return p;
  }

  return null;
}

function extractTurnover(json: unknown): number | null {
  if (json === null || json === undefined) return null;
  const rec = json as Record<string, unknown>;
  const keys = ["acml_tr_pbmn", "tr_amt", "turnover", "acml_vol_amt"];

  for (const k of keys) {
    if (k in rec) {
      const n = pickNumeric(rec[k], []);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }

  const out = rec.output;
  if (out && typeof out === "object" && !Array.isArray(out)) {
    const o = out as Record<string, unknown>;
    const p = numFromRow(o, keys);
    if (Number.isFinite(p) && p >= 0) return p;
  }

  const arr = firstOutputArray(json);
  if (arr.length > 0) {
    const p = numFromRow(arr[0], keys);
    if (Number.isFinite(p) && p >= 0) return p;
  }

  return null;
}

export async function fetchQuote(
  logger: Logger,
  config: AppConfig,
  symbol: string
): Promise<KiwoomQuoteResult> {
  const sym = symbol.trim();
  logger.info("kiwoom.quote", { msg: "fetch attempt", symbol: sym });

  if (!isKiwoomConnectionConfigured(config)) {
    const message = "skipped — Kiwoom connection not configured";
    logger.info("kiwoom.quote", { msg: "not_configured", reason: message });
    logger.info("quote.real", { msg: "quote real fetch fail", symbol: sym, reason: "not_configured" });
    return { ok: false, symbol: sym, message };
  }

  const token = await fetchKiwoomAccessToken(config);
  if (!token.ok) {
    logger.info("quote.real", {
      msg: "quote real fetch fail",
      symbol: sym,
      reason: "oauth_failed",
    });
    return { ok: false, symbol: sym, message: token.message };
  }

  const body: Record<string, unknown> = { stk_cd: sym };
  /** ka10001: 공식 Python 클라이언트와 동일 — `/api/dostk/stkinfo` + cont-yn / next-key. */
  const tr = await kiwoomTrPost(
    config,
    token.accessToken,
    config.kiwoomRestStkPath,
    config.kiwoomTrQuoteId,
    body,
    { "cont-yn": "N", "next-key": "0" }
  );

  if (!tr.ok) {
    const shape = describeJsonShape(tr.json);
    logger.info("quote.real.debug", {
      msg: "quote real fetch http/tr error",
      endpoint: config.kiwoomRestStkPath,
      apiId: config.kiwoomTrQuoteId,
      symbol: sym,
      httpStatus: tr.httpStatus,
      topLevelKeys: shape.topLevelKeys,
      outputArrayLength: shape.outputArrayLength,
      firstRowKeys: shape.firstRowKeys,
    });
    logger.info("quote.real", {
      msg: "quote real fetch fail",
      symbol: sym,
      reason: "tr_error",
      detail: tr.message,
    });
    return { ok: false, symbol: sym, message: tr.message };
  }

  const lastPrice = extractLastPrice(tr.json);
  const prevClose = extractPrevClosePrice(tr.json);
  const turnover = extractTurnover(tr.json);

  if (lastPrice === null) {
    const shape = describeJsonShape(tr.json);
    logger.info("quote.real.debug", {
      msg: "quote real fetch parse_no_price",
      endpoint: config.kiwoomRestStkPath,
      apiId: config.kiwoomTrQuoteId,
      symbol: sym,
      httpStatus: tr.httpStatus,
      topLevelKeys: shape.topLevelKeys,
      outputArrayLength: shape.outputArrayLength,
      firstRowKeys: shape.firstRowKeys,
    });
    logger.info("quote.real", {
      msg: "quote real fetch fail",
      symbol: sym,
      reason: "no_price_in_response",
    });
    return { ok: false, symbol: sym, message: "could not parse last price" };
  }

  logger.info("kiwoom.quote", { msg: "fetch ok", symbol: sym, lastPrice, prevClose, turnover });
  logger.info("quote.real.debug", {
    msg: "quote real parse",
    endpoint: config.kiwoomRestStkPath,
    apiId: config.kiwoomTrQuoteId,
    symbol: sym,
    httpStatus: tr.httpStatus,
  });
  logger.info("quote.real.parse", {
    msg: "quote real parse summary",
    symbol: sym,
    lastPrice,
  });
  logger.info("quote.real", { msg: "quote real fetch success", symbol: sym, lastPrice });
  return {
    ok: true,
    symbol: sym,
    lastPrice,
    prevClose,
    turnover,
    message: "ok",
  };
}
