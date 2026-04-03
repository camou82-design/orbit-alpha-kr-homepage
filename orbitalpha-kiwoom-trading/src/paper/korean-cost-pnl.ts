/**
 * Korean cash equity: commission on buy/sell + transaction tax on sell (simplified retail).
 * Percent fields are in "percent points" (0.015 = 0.015%).
 */

export interface KoreanPaperPnLResult {
  grossPnlKrw: number;
  feeBuyKrw: number;
  feeSellKrw: number;
  taxSellKrw: number;
  netPnlAfterFeeKrw: number;
  finalNetPnlKrw: number;
  /** finalNet / entry notional * 100 */
  finalNetPnlPct: number;
  /** (exit - entry) / entry * 100, before costs */
  grossPnlPct: number;
}

export function computeKoreanPaperPnL(input: {
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  feeBuyPct: number;
  feeSellPct: number;
  taxSellPct: number;
  includeTax: boolean;
}): KoreanPaperPnLResult {
  const { entryPrice, exitPrice, quantity } = input;
  const grossPnlKrw = (exitPrice - entryPrice) * quantity;
  const notionalBuy = entryPrice * quantity;
  const notionalSell = exitPrice * quantity;

  const feeBuyKrw = notionalBuy * (input.feeBuyPct / 100);
  const feeSellKrw = notionalSell * (input.feeSellPct / 100);
  const taxSellKrw = input.includeTax ? notionalSell * (input.taxSellPct / 100) : 0;

  const netPnlAfterFeeKrw = grossPnlKrw - feeBuyKrw - feeSellKrw;
  const finalNetPnlKrw = netPnlAfterFeeKrw - taxSellKrw;

  const grossPnlPct =
    entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
  const finalNetPnlPct =
    notionalBuy > 0 ? (finalNetPnlKrw / notionalBuy) * 100 : 0;

  return {
    grossPnlKrw,
    feeBuyKrw,
    feeSellKrw,
    taxSellKrw,
    netPnlAfterFeeKrw,
    finalNetPnlKrw,
    finalNetPnlPct,
    grossPnlPct,
  };
}

/** Minimum favourable price move (%) to cover round-trip costs + slippage (both sides). */
export function computeMinRequiredCostPct(input: {
  feeBuyPct: number;
  feeSellPct: number;
  taxSellPct: number;
  includeTax: boolean;
  fillSlippagePct: number;
}): number {
  const tax = input.includeTax ? input.taxSellPct : 0;
  return input.feeBuyPct + input.feeSellPct + tax + input.fillSlippagePct * 2;
}
