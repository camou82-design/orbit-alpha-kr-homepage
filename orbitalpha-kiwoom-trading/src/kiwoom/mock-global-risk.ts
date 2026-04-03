import type { GlobalRiskSnapshot } from "../core/types.js";

export type MockUsRiskScenario = "normal" | "weak" | "strong";

/**
 * In-memory global risk for paper loop (no API).
 * - normal: no regime flags under default thresholds
 * - weak: only one condition (not risk-off)
 * - strong: all three conditions (risk-off)
 */
export function getMockGlobalRiskSnapshot(
  scenario: MockUsRiskScenario
): GlobalRiskSnapshot {
  switch (scenario) {
    case "weak":
      return {
        nasdaqFuturesPct: -0.6,
        usdkrwChangePct: 0.1,
        kospi200FuturesPct: 0.05,
      };
    case "strong":
      return {
        nasdaqFuturesPct: -1.2,
        usdkrwChangePct: 0.8,
        kospi200FuturesPct: -0.9,
      };
    case "normal":
    default:
      return {
        nasdaqFuturesPct: 0.15,
        usdkrwChangePct: -0.1,
        kospi200FuturesPct: 0.12,
      };
  }
}
