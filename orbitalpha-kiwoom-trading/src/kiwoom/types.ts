/**
 * Kiwoom-specific domain types (market, account, orders).
 */

export type KiwoomSymbol = string;

export interface KiwoomAccountRef {
  accountNo: string;
}

/** Quote snapshot for filtering and scoring (mock or live adapter). */
export type QuoteTradingStatus = "NORMAL" | "HALTED" | "LIMIT" | "UNKNOWN";

export interface MarketQuote {
  symbol: KiwoomSymbol;
  name: string;
  /** 현재가(체결 기준). */
  lastPrice: number;
  /** 전일 종가(또는 기준가). 상한가·갭 과열 근사에 사용. */
  prevClose: number;
  /** 당일 시가. 없으면 필터 유틸에서 현재가 등으로 보강. */
  openPrice?: number | null;
  /** 당일 고가. 없으면 보강. */
  highPrice?: number | null;
  /** 당일 저가. 없으면 보강. */
  lowPrice?: number | null;
  /**
   * 당일 상한가(원). 없으면 mock에서 `prevClose`와 가격제한 비율로 근사.
   */
  upperLimitPrice?: number | null;
  /** Approximate KRW turnover (day or rolling; mock uses fixed intraday-style values). */
  turnover: number;
  status: QuoteTradingStatus;
  /** True for ETF/ETN-style names (mock flag; live: from master data). */
  isEtfOrEtn: boolean;
}
