import type { WeekendRiskSnapshot } from "../core/types.js";

export type MockWeekendRiskScenario = "normal" | "caution" | "severe";

/**
 * Mock headline risk between Friday close and Monday open (no external API).
 * `usRiskOff` is typically merged from `evaluateUsRisk` in the paper loop.
 */
export function getMockWeekendRiskSnapshot(
  scenario: MockWeekendRiskScenario
): Omit<WeekendRiskSnapshot, "usRiskOff"> {
  switch (scenario) {
    case "caution":
      return {
        usdkrwShock: true,
        oilShock: false,
        sectorBadNews: false,
      };
    case "severe":
      return {
        usdkrwShock: true,
        oilShock: true,
        sectorBadNews: true,
      };
    case "normal":
    default:
      return {
        usdkrwShock: false,
        oilShock: false,
        sectorBadNews: false,
      };
  }
}
