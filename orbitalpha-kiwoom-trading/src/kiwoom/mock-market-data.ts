import type { MarketDataAdapter } from "./market-data.js";
import type { KiwoomSymbol, MarketQuote } from "./types.js";

/** Static mock universe; `getQuotes` adds small price jitter for repeatable loop tests. */
const MOCK_BASE: readonly MarketQuote[] = [
  {
    symbol: "005930",
    name: "삼성전자",
    lastPrice: 71_200,
    prevClose: 70_800,
    openPrice: 70_900,
    highPrice: 71_500,
    lowPrice: 70_700,
    turnover: 420_000_000_000,
    status: "NORMAL",
    isEtfOrEtn: false,
  },
  {
    symbol: "000660",
    name: "SK하이닉스",
    lastPrice: 186_500,
    prevClose: 185_000,
    openPrice: 185_500,
    highPrice: 187_000,
    lowPrice: 185_000,
    turnover: 280_000_000_000,
    status: "NORMAL",
    isEtfOrEtn: false,
  },
  {
    symbol: "069500",
    name: "KODEX 200",
    lastPrice: 35_120,
    prevClose: 35_050,
    openPrice: 35_080,
    highPrice: 35_200,
    lowPrice: 35_000,
    turnover: 15_000_000_000,
    status: "NORMAL",
    isEtfOrEtn: true,
  },
  {
    symbol: "123456",
    name: "저유동 테스트",
    lastPrice: 12_300,
    prevClose: 12_200,
    openPrice: 12_250,
    highPrice: 12_350,
    lowPrice: 12_180,
    turnover: 120_000_000,
    status: "NORMAL",
    isEtfOrEtn: false,
  },
  /** 상한가 근접: headroom 필터 제외 사례 */
  {
    symbol: "888888",
    name: "상한가근접",
    lastPrice: 12_800,
    prevClose: 10_000,
    openPrice: 12_000,
    highPrice: 12_900,
    lowPrice: 11_900,
    turnover: 2_000_000_000,
    status: "NORMAL",
    isEtfOrEtn: false,
  },
  /** 명시적 상한가 주입 예시 */
  {
    symbol: "777777",
    name: "상한가명시",
    lastPrice: 50_000,
    prevClose: 40_000,
    upperLimitPrice: 52_000,
    openPrice: 48_000,
    highPrice: 50_500,
    lowPrice: 47_500,
    turnover: 1_500_000_000,
    status: "NORMAL",
    isEtfOrEtn: false,
  },
  /** 갭 과열: 전일 대비 상승률이 컷 초과(상한 여력은 남김) */
  {
    symbol: "111111",
    name: "갭과열",
    lastPrice: 12_200,
    prevClose: 10_000,
    openPrice: 10_500,
    highPrice: 12_500,
    lowPrice: 10_400,
    turnover: 3_000_000_000,
    status: "NORMAL",
    isEtfOrEtn: false,
  },
  /** 윗꼬리 과다: 고가 대비 현재가 하락, 윗꼬리 비율 컷 초과 */
  {
    symbol: "222222",
    name: "윗꼬리과다",
    lastPrice: 11_950,
    prevClose: 10_000,
    openPrice: 12_500,
    highPrice: 13_000,
    lowPrice: 11_900,
    turnover: 3_000_000_000,
    status: "NORMAL",
    isEtfOrEtn: false,
  },
  /** 필터 정상 통과용(유동성·점수만 맞으면 진입 후보 가능) */
  {
    symbol: "333333",
    name: "정상샘플",
    lastPrice: 51_000,
    prevClose: 50_000,
    openPrice: 50_200,
    highPrice: 51_200,
    lowPrice: 49_900,
    turnover: 3_000_000_000,
    status: "NORMAL",
    isEtfOrEtn: false,
  },
  /** 월요일 장초 갭 컷(15%) 테스트: 전일 대비 ~17% — 평일 20% 컷에는 걸리지 않을 수 있음 */
  {
    symbol: "444444",
    name: "월요이갭테스트",
    lastPrice: 11_700,
    prevClose: 10_000,
    openPrice: 10_800,
    highPrice: 11_800,
    lowPrice: 10_750,
    turnover: 3_000_000_000,
    status: "NORMAL",
    isEtfOrEtn: false,
  },
  {
    symbol: "999999",
    name: "거래정지 테스트",
    lastPrice: 5000,
    prevClose: 5000,
    openPrice: 5000,
    highPrice: 5000,
    lowPrice: 5000,
    turnover: 50_000_000_000,
    status: "HALTED",
    isEtfOrEtn: false,
  },
];

function cloneWithJitter(q: MarketQuote): MarketQuote {
  const noise = (Math.random() - 0.5) * 0.006;
  const lastPrice = Math.max(1, Math.round(q.lastPrice * (1 + noise)));
  const open = q.openPrice ?? q.prevClose;
  const baseHigh = q.highPrice ?? Math.max(open, lastPrice, q.prevClose);
  const baseLow = q.lowPrice ?? Math.min(open, lastPrice, q.prevClose);
  const highPrice = Math.max(baseHigh, lastPrice, open);
  const lowPrice = Math.min(baseLow, lastPrice, open);
  return { ...q, lastPrice, highPrice, lowPrice, openPrice: open };
}

export class MockMarketDataAdapter implements MarketDataAdapter {
  async listSymbols(): Promise<readonly KiwoomSymbol[]> {
    return MOCK_BASE.map((q) => q.symbol);
  }

  async getQuotes(
    symbols: readonly KiwoomSymbol[]
  ): Promise<ReadonlyMap<KiwoomSymbol, MarketQuote>> {
    const set = new Set(symbols);
    const map = new Map<KiwoomSymbol, MarketQuote>();
    for (const q of MOCK_BASE) {
      if (set.has(q.symbol)) {
        map.set(q.symbol, cloneWithJitter(q));
      }
    }
    return map;
  }
}
