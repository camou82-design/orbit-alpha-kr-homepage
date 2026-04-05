import type { AppConfig } from "../infra/config.js";
import {
  dashboardHttpAuthEnabled,
  dashboardSessionSecretOk,
} from "../infra/dashboard-http-auth.js";
import { readLiveOpsState, type LiveOpsStateFile } from "./live-ops-state.js";

const KO: Record<string, string> = {
  kill_switch: "긴급 중단이 활성화되어 신규 매수가 차단되었습니다",
  ops_daily_order_cap: "운영 설정 일일 주문 횟수 상한에 도달했습니다",
  ops_loss_halt: "당일 손실 한도를 초과하여 신규 매수가 차단되었습니다",
  ops_reentry_cooldown: "동일 종목 재진입 쿨다운 중입니다",
  prod_dashboard_auth_off:
    "운영(production) 환경에서 대시보드 HTTP 인증이 꺼져 있어 실주문이 차단되었습니다",
  dashboard_secret_weak:
    "대시보드 세션 비밀값이 없거나 너무 짧아 실주문이 차단되었습니다",
};

function productionLike(): boolean {
  return (process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

function envBlockReasonsForBuy(): string[] {
  const r: string[] = [];
  if (productionLike()) {
    if (!dashboardHttpAuthEnabled()) r.push("prod_dashboard_auth_off");
    if (dashboardHttpAuthEnabled() && !dashboardSessionSecretOk()) {
      r.push("dashboard_secret_weak");
    }
  }
  return r;
}

function lossHaltActive(state: LiveOpsStateFile, liveMaxDailyLossKrw: number): boolean {
  if (state.lossHaltActive) return true;
  const limit = Math.max(0, liveMaxDailyLossKrw);
  if (limit <= 0) return false;
  return state.dailyRealizedPnlKrw <= -limit;
}

function reentryBlocked(
  state: LiveOpsStateFile,
  symbol: string,
  cooldownMin: number
): boolean {
  if (cooldownMin <= 0) return false;
  const sym = symbol.trim();
  const flatAt = state.symbolLastFlatAt[sym];
  if (!flatAt) return false;
  const t = Date.parse(flatAt);
  if (Number.isNaN(t)) return false;
  const elapsedMin = (Date.now() - t) / 60_000;
  return elapsedMin < cooldownMin;
}

export interface LiveOperationalGateResult {
  ok: boolean;
  reasons: string[];
  reasonKoLine: string;
}

/**
 * 운영 가드 — 매도(SELL)는 청산·위험 축소를 위해 긴급중단·일일횟수·손실한도·재진입·운영 env 차단에서 제외.
 * 매수(BUY)만 전부 적용.
 */
export function evaluateLiveOperationalOrderGate(
  config: AppConfig,
  input: { symbol: string; side: "BUY" | "SELL" }
): LiveOperationalGateResult {
  const state = readLiveOpsState();
  const reasons: string[] = [];

  if (input.side === "SELL") {
    return { ok: true, reasons: [], reasonKoLine: "" };
  }

  for (const r of envBlockReasonsForBuy()) {
    reasons.push(r);
  }

  if (state.killSwitchActive) {
    reasons.push("kill_switch");
  }

  const maxOd = Math.max(0, Math.floor(config.liveOpsMaxOrdersPerDay));
  if (maxOd > 0 && state.ordersTodayCount >= maxOd) {
    reasons.push("ops_daily_order_cap");
  }

  if (lossHaltActive(state, config.liveMaxDailyLossKrw)) {
    reasons.push("ops_loss_halt");
  }

  if (
    reentryBlocked(
      state,
      input.symbol,
      Math.max(0, config.liveOpsReentryCooldownMinutes)
    )
  ) {
    reasons.push("ops_reentry_cooldown");
  }

  const first = reasons[0];
  let reasonKoLine = "";
  if (reasons.includes("ops_loss_halt") && state.lossHaltReasonKo) {
    reasonKoLine = state.lossHaltReasonKo;
  } else if (first) {
    reasonKoLine =
      KO[first] ?? "운영 가드에 의해 신규 매수가 차단되었습니다";
  }

  return {
    ok: reasons.length === 0,
    reasons,
    reasonKoLine,
  };
}

export function liveOpsEnvWarningsForBanner(): string[] {
  const lines: string[] = [];
  if (!dashboardHttpAuthEnabled()) {
    lines.push("대시보드 HTTP 인증(KIWOOM_DASHBOARD_HTTP_AUTH)이 꺼져 있습니다.");
  }
  if (dashboardHttpAuthEnabled() && !dashboardSessionSecretOk()) {
    lines.push(
      "KIWOOM_DASHBOARD_SESSION_SECRET이 없거나 너무 짧습니다(최소 16자 권장)."
    );
  }
  if (productionLike() && !dashboardHttpAuthEnabled()) {
    lines.push("운영(production)에서 인증 미적용 — 실주문이 차단될 수 있습니다.");
  }
  return lines;
}
