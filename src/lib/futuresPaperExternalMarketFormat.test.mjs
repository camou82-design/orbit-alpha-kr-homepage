import assert from "node:assert/strict";
import {
  pickExternalMarketContext,
  mapExternalMarketDirection,
  buildExternalMarketSummary,
  externalMarketStatusBadges,
  formatExternalMomentumSourceLine
} from "./futuresPaperFormat.ts";

function pass(label) {
  console.log(`PASS: ${label}`);
}

const sampleCtx = {
  external_context_score: 0.34,
  external_signal_reliability: 0.85,
  available_signal_weight: 0.85,
  external_market_context_fetch_enabled: true,
  external_market_context_enabled: false,
  external_market_context_shadow_mode: true,
  trading_impact: "none",
  external_context_applied: false,
  nq_signal: 0.52,
  source_display: {
    nq: { market_direction: "up", btc_impact: 0.52 },
    dxy: { market_direction: "down", btc_impact: 0.28 }
  }
};

const bundle = {
  engineState: { external_market_context: sampleCtx }
};

assert.ok(pickExternalMarketContext(bundle));
pass("pickExternalMarketContext reads engineState.external_market_context");

assert.equal(mapExternalMarketDirection(0.34, 0.85, 0.85).label, "롱 우호");
assert.equal(mapExternalMarketDirection(0, 0, 0.6).label, "외부 데이터 부족 / 중립");
pass("direction labels");

assert.ok(buildExternalMarketSummary(sampleCtx, mapExternalMarketDirection(0.34, 0.85, 0.85)).includes("관찰 전용"));
pass("summary shadow suffix");

const badges = externalMarketStatusBadges(sampleCtx);
assert.ok(badges.includes("관찰 전용") && badges.includes("실거래 영향 없음"));
pass("status badges");

assert.equal(formatExternalMomentumSourceLine(sampleCtx, "nq", 0.52), "시장 ↑ / BTC 영향 +0.52");
assert.equal(formatExternalMomentumSourceLine(sampleCtx, "dxy", -0.28), "시장 ↓ / BTC 영향 +0.28");
pass("source lines");

console.log("futuresPaperExternalMarketFormat: ALL PASS");
