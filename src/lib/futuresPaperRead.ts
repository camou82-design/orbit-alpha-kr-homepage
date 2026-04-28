import type { FuturesPaperDataBundle } from "@/lib/futuresPaperBundleCore";
import { loadFuturesPaperBundleFromDiskRoot } from "@/lib/futuresPaperBundleCore";

export type {
  FuturesPaperDataBundle,
  FuturesPaperHealthHistoryItem,
  FuturesPaperSymbolRow
} from "@/lib/futuresPaperBundleCore";

const HEADER_TOKEN = "x-orbitalpha-futures-paper-token";

function emptyBundle(configHint: string): FuturesPaperDataBundle {
  return {
    configured: false,
    configHint,
    summary: null,
    summaryRange: null,
    summaryTrend: null,
    summaryDaily: null,
    summaryWindow: null,
    summaryHealth: null,
    dashboard: null,
    engineState: null,
    latestSnapshot: null,
    latestMeta: null,
    symbolRows: [],
    healthHistoryRecent: [],
    ledgerPerformance: null,
    openPositions: [],
    positionsHistory: [],
    eventsRecent: [],
    generatedAt: Date.now()
  };
}

function isBundleShape(v: unknown): v is FuturesPaperDataBundle {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.configured === "boolean" && Array.isArray(o.symbolRows) && Array.isArray(o.healthHistoryRecent);
}

async function loadFromRemoteApi(baseUrl: string, secret: string): Promise<FuturesPaperDataBundle> {
  const root = baseUrl.replace(/\/+$/, "");
  const url = `${root}/api/futures-paper/data`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { [HEADER_TOKEN]: secret },
      cache: "no-store"
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return emptyBundle(`Lightsail API unreachable: ${msg}`);
  }
  if (res.status === 401 || res.status === 403) {
    return emptyBundle("Lightsail API rejected the token (check ORBITALPHA_FUTURES_PAPER_API_SECRET matches).");
  }
  if (!res.ok) {
    return emptyBundle(`Lightsail API error: HTTP ${res.status}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return emptyBundle("Lightsail API returned invalid JSON.");
  }
  if (!isBundleShape(json)) {
    return emptyBundle("Lightsail API response did not match the expected bundle shape.");
  }
  const b = json as FuturesPaperDataBundle;
  const bAny = b as any;
  const tradeControl =
    bAny.tradeControl ??
    (bAny.dashboard && typeof bAny.dashboard === "object" ? bAny.dashboard.tradeControl : null) ??
    null;

  // If control fields are missing, try fetching from the control status endpoint
  if (bAny.serverTradeEnabled === undefined) {
    try {
      const controlUrl = `${root}/api/futures-paper/control`;
      const controlRes = await fetch(controlUrl, {
        headers: { [HEADER_TOKEN]: secret },
        cache: "no-store"
      });
      if (controlRes.ok) {
        const controlJson = await controlRes.json();
        Object.assign(bAny, controlJson);
      }
    } catch (e) {
      console.warn("[futures-paper] Failed to fetch secondary control status", e);
    }
  }

  const withDefaults: FuturesPaperDataBundle = {
    ...b,
    summaryRange: (b as any).summaryRange ?? null,
    summaryTrend: (b as any).summaryTrend ?? null,
    engineState: (b as any).engineState ?? null,
    ledgerPerformance: b.ledgerPerformance ?? null,
    openPositions: Array.isArray((b as any).openPositions) ? ((b as any).openPositions as unknown[]) : [],
    positionsHistory: Array.isArray((b as any).positionsHistory) ? ((b as any).positionsHistory as unknown[]) : [],
    eventsRecent: Array.isArray((b as any).eventsRecent) ? ((b as any).eventsRecent as unknown[]) : [],
    generatedAt:
      typeof (b as any).generatedAt === "number" && Number.isFinite((b as any).generatedAt) ? ((b as any).generatedAt as number) : Date.now()
  };
  if (tradeControl && typeof tradeControl === "object") {
    (withDefaults as any).tradeControl = tradeControl;
    (withDefaults as any).serverTradeEnabled = (withDefaults as any).serverTradeEnabled ?? tradeControl.serverTradeEnabled;
    (withDefaults as any).closeOnlyMode = (withDefaults as any).closeOnlyMode ?? tradeControl.closeOnlyMode;
    (withDefaults as any).killSwitch = (withDefaults as any).killSwitch ?? tradeControl.killSwitch;
    (withDefaults as any).trade_control_updated_at = (withDefaults as any).trade_control_updated_at ?? tradeControl.updatedAt;
  }
  return withDefaults;
}

/**
 * Production (Vercel): set ORBITALPHA_FUTURES_PAPER_API_URL + ORBITALPHA_FUTURES_PAPER_API_SECRET.
 * Local dev: optionally set ORBITALPHA_FUTURES_PAPER_ROOT to read disk (same layout as orbitalpha-futures-paper).
 */
export async function loadFuturesPaperDataBundle(): Promise<FuturesPaperDataBundle> {
  const apiUrl = process.env.ORBITALPHA_FUTURES_PAPER_API_URL?.trim();
  if (apiUrl) {
    const secret = process.env.ORBITALPHA_FUTURES_PAPER_API_SECRET?.trim();
    if (!secret) {
      return emptyBundle(
        "Set ORBITALPHA_FUTURES_PAPER_API_SECRET (server-only, same value as on the Lightsail reader API)."
      );
    }
    return loadFromRemoteApi(apiUrl, secret);
  }

  const root = process.env.ORBITALPHA_FUTURES_PAPER_ROOT?.trim();
  if (root) {
    return loadFuturesPaperBundleFromDiskRoot(root);
  }

  return emptyBundle(
    "Set ORBITALPHA_FUTURES_PAPER_API_URL (+ ORBITALPHA_FUTURES_PAPER_API_SECRET) for production, or ORBITALPHA_FUTURES_PAPER_ROOT for local disk."
  );
}
